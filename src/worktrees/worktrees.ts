import { copyFile, lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { evaluate, type PolicySnapshot } from "../check/engine.ts";
import type { Checkpoint } from "../policy/checkpoints.ts";
import { NAME_PATTERN } from "../policy/schema.ts";
import { createGit, type Git, type GitIdentity } from "./git.ts";

export function integrationBranch(runId: string): string {
  return `foreman/${runId}/integration`;
}

export function taskBranch(runId: string, taskId: string): string {
  return `foreman/${runId}/task-${taskId}`;
}

/** The Task can't start. `reason` is written to be shown to the Operator as it is. */
export class WorktreeRefusedError extends Error {
  constructor(
    readonly reason: string,
    /** Repository-relative paths that caused the refusal. */
    readonly paths: readonly string[] = [],
  ) {
    super(reason);
  }
}

export type MergeResult =
  | { status: "merged"; sha: string }
  | {
      status: "conflict";
      files: string[];
      taskSha: string;
      integrationSha: string;
      /** Ready to give a Worker as its next instruction. */
      instruction: string;
    };

export interface WorktreeDeps {
  /** The environment git runs in. Pass a scrubbed one. */
  env: Record<string, string>;
  /** Every decision here comes from this Policy, through the Check Engine. */
  policy: PolicySnapshot;
  identity?: GitIdentity;
}

export interface TaskWorktreeRequest {
  /** The Project's repository checkout. */
  repoDir: string;
  baseRef: string;
  /** The Run's directory. Worktrees are created under `<runDir>/worktrees/<project>`. */
  runDir: string;
  project: string;
  runId: string;
  taskId: string;
  /** Untracked files to copy in from the checkout, relative to it. */
  copyFiles?: readonly string[];
}

export interface TaskWorktree {
  path: string;
  branch: string;
  baseSha: string;
}

export interface View {
  path: string;
  /** The commit the view was detached at. */
  sha: string;
}

const DEFAULT_IDENTITY: GitIdentity = { name: "Foreman", email: "foreman@localhost.invalid" };

function checkName(kind: string, value: string): void {
  if (!NAME_PATTERN.test(value)) throw new WorktreeRefusedError(`${kind} "${value}" isn't a valid name`);
}

export function openWorktrees(deps: WorktreeDeps) {
  const git: Git = createGit(deps.env, deps.identity ?? DEFAULT_IDENTITY, deps.policy.policy.policies.guard.git.overrides);

  /** Names what a rule other than `allow` or `flag` says about these paths, or nothing. */
  function refusals(checkpoint: Checkpoint, paths: readonly string[]): { rule: string; layer: string; paths: string[] }[] {
    const byRule = new Map<string, { rule: string; layer: string; paths: string[] }>();
    for (const path of paths) {
      const decision = evaluate(checkpoint, { path }, deps.policy);
      if (decision.effect === "allow" || decision.effect === "flag") continue;
      const entry = byRule.get(decision.rule) ?? { rule: decision.rule, layer: decision.layer, paths: [] };
      entry.paths.push(path);
      byRule.set(decision.rule, entry);
    }
    return [...byRule.values()];
  }

  /** A worktree checks out every tracked file, so a tracked denied file can't be allowed in. */
  async function assertNoTrackedDenied(repoDir: string, ref: string): Promise<void> {
    const listing = await git.run(repoDir, ["ls-tree", "-r", "-z", "--name-only", ref]);
    const found = refusals("worktree.tracked", listing.split("\0").filter(Boolean));
    if (found.length === 0) return;
    const detail = found
      .map((entry) => `${entry.paths.join(", ")} (rule "${entry.rule}", ${entry.layer} layer)`)
      .join("; ");
    throw new WorktreeRefusedError(
      `the repository tracks files that Policy denies to Workers: ${detail}. Remove them from the repository, or add an explicit exception to Policy`,
      found.flatMap((entry) => entry.paths),
    );
  }

  async function assertCopyable(repoDir: string, copyFiles: readonly string[]): Promise<void> {
    const found = refusals("worktree.copy", copyFiles);
    if (found.length > 0) {
      const detail = found.map((entry) => `${entry.paths.join(", ")} (rule "${entry.rule}")`).join("; ");
      throw new WorktreeRefusedError(`copyFiles names files that Policy denies to Workers: ${detail}`, found.flatMap((e) => e.paths));
    }
    const root = await realpath(repoDir);
    for (const file of copyFiles) {
      const source = join(repoDir, file);
      const stats = await lstat(source).catch(() => undefined);
      if (stats === undefined || !stats.isFile()) {
        throw new WorktreeRefusedError(`copyFiles entry "${file}" isn't a regular file in the checkout`, [file]);
      }
      if (relative(root, await realpath(source)).startsWith("..")) {
        throw new WorktreeRefusedError(`copyFiles entry "${file}" resolves outside the checkout`, [file]);
      }
    }
  }

  async function resolve(repoDir: string, ref: string): Promise<string> {
    return (await git.run(repoDir, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).trim();
  }

  return {
    /**
     * Creates the Task's worktree on its own branch, from the Run's Integration Branch
     * (created at `baseRef` on first use). Nothing is created if Policy refuses. A
     * worktree already on the expected branch is returned as it is, so a retry is safe.
     */
    async prepareTask(request: TaskWorktreeRequest): Promise<TaskWorktree> {
      const { repoDir, baseRef, runDir, project, runId, taskId } = request;
      checkName("Run ID", runId);
      checkName("Task ID", taskId);
      checkName("Project", project);

      const integration = integrationBranch(runId);
      const branch = taskBranch(runId, taskId);
      const path = join(runDir, "worktrees", project, `task-${taskId}`);

      const existing = await git.try(path, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => undefined);
      if (existing?.exitCode === 0 && existing.stdout.trim() === branch) {
        return { path, branch, baseSha: await resolve(repoDir, integration) };
      }

      const hasIntegration =
        (await git.try(repoDir, ["rev-parse", "--verify", "--quiet", `refs/heads/${integration}`])).exitCode === 0;
      const start = hasIntegration ? integration : await resolve(repoDir, baseRef);
      await assertNoTrackedDenied(repoDir, start);
      const copyFiles = request.copyFiles ?? [];
      await assertCopyable(repoDir, copyFiles);

      if (!hasIntegration) {
        // An empty old value makes this create-only, so Tasks prepared in parallel can't both create it.
        const created = await git.try(repoDir, ["update-ref", `refs/heads/${integration}`, start, ""]);
        if (created.exitCode !== 0) await resolve(repoDir, integration);
      }
      await mkdir(dirname(path), { recursive: true });
      await git.run(repoDir, ["worktree", "add", "-b", branch, path, integration]);
      for (const file of copyFiles) {
        await mkdir(dirname(join(path, file)), { recursive: true });
        await copyFile(join(repoDir, file), join(path, file));
      }
      return { path, branch, baseSha: await resolve(repoDir, integration) };
    },

    /**
     * Commits everything the Worker left uncommitted, ignored files excepted, so the SHA
     * that gets verified covers all the work. Returns the worktree's head.
     */
    async capture(worktreePath: string): Promise<{ sha: string; committed: boolean }> {
      await git.run(worktreePath, ["add", "--all"]);
      const dirty = (await git.run(worktreePath, ["status", "--porcelain"])).trim() !== "";
      if (dirty) {
        await git.run(worktreePath, ["commit", "--no-verify", "--message", "foreman: capture uncommitted work"]);
      }
      return { sha: (await git.run(worktreePath, ["rev-parse", "HEAD"])).trim(), committed: dirty };
    },

    /**
     * Merges the Task's branch into the Run's Integration Branch without touching a
     * working directory. A conflict changes nothing and comes back as data.
     */
    async mergeTask(request: { repoDir: string; runId: string; taskId: string }): Promise<MergeResult> {
      const { repoDir, runId, taskId } = request;
      const integration = integrationBranch(runId);
      const branch = taskBranch(runId, taskId);
      const integrationSha = await resolve(repoDir, integration);
      const taskSha = await resolve(repoDir, branch);
      const isAncestor = async (a: string, b: string) =>
        (await git.try(repoDir, ["merge-base", "--is-ancestor", a, b])).exitCode === 0;

      if (await isAncestor(taskSha, integrationSha)) return { status: "merged", sha: integrationSha };

      let merged = taskSha;
      if (!(await isAncestor(integrationSha, taskSha))) {
        const tree = await git.try(repoDir, ["merge-tree", "--write-tree", "--name-only", integrationSha, taskSha]);
        if (tree.exitCode === 1) {
          const [, ...rest] = tree.stdout.split("\n");
          const files = rest.slice(0, rest.indexOf("")).filter(Boolean);
          return {
            status: "conflict",
            files,
            taskSha,
            integrationSha,
            instruction: `Merging ${branch} into ${integration} conflicts in: ${files.join(", ")}. Merge ${integration} into your branch, resolve every conflict, commit, and finish again.`,
          };
        }
        if (tree.exitCode !== 0) throw new Error(`git merge-tree failed: ${tree.stderr.trim()}`);
        merged = (
          await git.run(repoDir, [
            "commit-tree",
            tree.stdout.split("\n")[0] as string,
            "-p",
            integrationSha,
            "-p",
            taskSha,
            "-m",
            `Merge ${branch} into ${integration}`,
          ])
        ).trim();
      }
      await git.run(repoDir, ["update-ref", `refs/heads/${integration}`, merged, integrationSha]);
      return { status: "merged", sha: merged };
    },

    /** A detached view of `baseRef` for a read-only Step. Refused like a worktree if it tracks a denied file. */
    async createView(request: { repoDir: string; baseRef: string; viewDir: string }): Promise<View> {
      const sha = await resolve(request.repoDir, request.baseRef);
      await assertNoTrackedDenied(request.repoDir, sha);
      await mkdir(dirname(request.viewDir), { recursive: true });
      await git.run(request.repoDir, ["worktree", "add", "--detach", request.viewDir, sha]);
      return { path: request.viewDir, sha };
    },

    /** What changed in a view since it was created, found with git. Empty means untouched. */
    async viewChanges(view: View): Promise<string[]> {
      const changes: string[] = [];
      const head = (await git.run(view.path, ["rev-parse", "HEAD"])).trim();
      if (head !== view.sha) changes.push("HEAD moved");
      const status = await git.run(view.path, ["status", "--porcelain", "-z", "--ignored"]);
      for (const entry of status.split("\0").filter(Boolean)) changes.push(entry.slice(3));
      return changes;
    },

    /** Removes every worktree and view under `runDir`. Branches stay until the Operator deletes them. */
    async cleanupRun(request: { repoDir: string; runDir: string }): Promise<void> {
      const root = (await realpath(request.runDir).catch(() => request.runDir)) + sep;
      const listing = await git.run(request.repoDir, ["worktree", "list", "--porcelain"]);
      for (const line of listing.split("\n")) {
        if (!line.startsWith("worktree ")) continue;
        const path = line.slice("worktree ".length);
        if (path.startsWith(root)) await git.run(request.repoDir, ["worktree", "remove", "--force", path]);
      }
      await git.run(request.repoDir, ["worktree", "prune"]);
    },
  };
}

export type Worktrees = ReturnType<typeof openWorktrees>;
