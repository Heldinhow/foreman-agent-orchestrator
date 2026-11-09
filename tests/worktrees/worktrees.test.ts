import { describe, expect, test } from "bun:test";
import { chmod, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openWorktrees, WorktreeRefusedError } from "../../src/worktrees/worktrees.ts";
import { createTempRepo, type TempRepo } from "../helpers/git.ts";
import { layerWithRules, policySnapshot } from "../helpers/policy.ts";
import { hermeticEnv } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import type { WorkspaceFixture } from "../helpers/workspace.ts";

const exists = (path: string) => stat(path).then(() => true, () => false);

async function setup(policy: WorkspaceFixture = {}, files: Record<string, string> = { "README.md": "readme\n" }) {
  const repo = await createTempRepo();
  for (const [file, content] of Object.entries(files)) await repo.commitFile(file, content, `add ${file}`);
  const runDir = join(await makeTempDir(), "runs", "run1");
  const worktrees = openWorktrees({
    env: hermeticEnv(await makeTempDir()),
    policy: await policySnapshot(policy),
  });
  const prepare = (taskId: string, copyFiles?: string[]) =>
    worktrees.prepareTask({ repoDir: repo.path, baseRef: "main", runDir, project: "catalog-api", runId: "run1", taskId, copyFiles });
  return { repo, runDir, worktrees, prepare };
}

async function writeIn(dir: string, file: string, content: string) {
  await mkdir(join(dir, file, ".."), { recursive: true });
  await writeFile(join(dir, file), content);
}

async function commitIn(worktree: string, repo: TempRepo, file: string, content: string) {
  await writeIn(worktree, file, content);
  await repo.git("-C", worktree, "add", "--", file);
  await repo.git("-C", worktree, "commit", "--quiet", "--message", `edit ${file}`);
}

describe("create, capture, merge and clean up (AC-22)", () => {
  test("parallel Tasks in one repository get separate worktrees on the named branches, and their work combines on the Integration Branch", async () => {
    const { repo, worktrees, prepare, runDir } = await setup();

    const [one, two] = await Promise.all([prepare("one"), prepare("two")]);
    expect(one.path).not.toBe(two.path);
    expect(one.branch).toBe("foreman/run1/task-one");
    expect(two.branch).toBe("foreman/run1/task-two");
    expect(await repo.git("-C", one.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(one.branch);
    expect(await repo.git("-C", two.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(two.branch);
    expect(one.path.startsWith(runDir)).toBe(true);

    await writeIn(one.path, "src/one.ts", "one\n");
    await writeIn(two.path, "src/two.ts", "two\n");
    const capturedOne = await worktrees.capture(one.path);
    const capturedTwo = await worktrees.capture(two.path);
    const first = await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "one" });
    const second = await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "two" });

    expect(first).toEqual({ status: "merged", sha: capturedOne.sha });
    expect(second.status).toBe("merged");
    const integration = "foreman/run1/integration";
    expect(await repo.git("rev-parse", integration)).toBe((second as { sha: string }).sha);
    for (const sha of [capturedOne.sha, capturedTwo.sha]) {
      expect((await repo.tryGit("merge-base", "--is-ancestor", sha, integration)).exitCode).toBe(0);
    }
    expect(await repo.git("show", `${integration}:src/one.ts`)).toBe("one");
    expect(await repo.git("show", `${integration}:src/two.ts`)).toBe("two");
    // The Operator's own branch and checkout are untouched.
    expect(await repo.git("rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(await exists(join(repo.path, "src", "one.ts"))).toBe(false);

    const later = await prepare("three");
    expect(await readFile(join(later.path, "src", "two.ts"), "utf8")).toBe("two\n");
  });

  test("merging a Task that is already on the Integration Branch changes nothing", async () => {
    const { repo, worktrees, prepare } = await setup();
    const task = await prepare("one");
    await writeIn(task.path, "a.txt", "a\n");
    await worktrees.capture(task.path);
    const first = await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "one" });

    expect(await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "one" })).toEqual(first);
  });

  test("preparing a Task whose worktree already exists returns it", async () => {
    const { prepare } = await setup();
    const first = await prepare("one");

    expect(await prepare("one")).toEqual(first);
  });

  test("cleanup removes the worktrees and views but keeps the branches", async () => {
    const { repo, worktrees, prepare, runDir } = await setup();
    const task = await prepare("one");
    const view = await worktrees.createView({ repoDir: repo.path, baseRef: "main", viewDir: join(runDir, "views", "catalog-api") });

    await worktrees.cleanupRun({ repoDir: repo.path, runDir });

    expect(await exists(task.path)).toBe(false);
    expect(await exists(view.path)).toBe(false);
    expect(await repo.git("branch", "--list", "foreman/run1/*")).toContain("foreman/run1/task-one");
    expect(await repo.git("worktree", "list", "--porcelain")).not.toContain(runDir);
    expect(await readdir(repo.path)).toContain("README.md");
  });

  test("a Run or Task ID that could escape a branch name is refused", async () => {
    const { prepare } = await setup();

    await expect(prepare("../evil")).rejects.toBeInstanceOf(WorktreeRefusedError);
  });
});

describe("capture", () => {
  test("commits uncommitted changes and untracked files, and leaves ignored files out", async () => {
    const { repo, worktrees, prepare } = await setup({}, { ".gitignore": "build/\n", "README.md": "readme\n" });
    const task = await prepare("one");
    await writeIn(task.path, "README.md", "changed\n");
    await writeIn(task.path, "src/new.ts", "new\n");
    await writeIn(task.path, "build/out.js", "ignored\n");

    const { sha, committed } = await worktrees.capture(task.path);

    expect(committed).toBe(true);
    expect(await repo.git("-C", task.path, "status", "--porcelain", "--ignored")).toBe("!! build/");
    const files = await repo.git("ls-tree", "-r", "--name-only", sha);
    expect(files.split("\n")).toEqual([".gitignore", "README.md", "src/new.ts"]);
    expect(await repo.git("show", `${sha}:README.md`)).toBe("changed");
  });

  test("returns the head without a new commit when the Worker already committed everything", async () => {
    const { repo, worktrees, prepare } = await setup();
    const task = await prepare("one");
    await commitIn(task.path, repo, "a.txt", "a\n");
    const head = await repo.git("-C", task.path, "rev-parse", "HEAD");

    expect(await worktrees.capture(task.path)).toEqual({ sha: head, committed: false });
  });

  test("doesn't run a hook that a Worker planted through the shared git config", async () => {
    const { repo, worktrees, prepare } = await setup();
    const marker = join(await makeTempDir(), "hook-ran");
    const hooks = await makeTempDir();
    await writeFile(join(hooks, "pre-commit"), `#!/bin/sh\ntouch ${marker}\n`);
    await chmod(join(hooks, "pre-commit"), 0o755);
    await repo.git("config", "core.hooksPath", hooks);
    const task = await prepare("one");
    await writeIn(task.path, "a.txt", "a\n");

    await worktrees.capture(task.path);

    expect(await exists(marker)).toBe(false);
  });
});

describe("a merge conflict", () => {
  async function conflicting() {
    const context = await setup({}, { "shared.txt": "base\n" });
    const { repo, worktrees, prepare } = context;
    const one = await prepare("one");
    const two = await prepare("two");
    await commitIn(one.path, repo, "shared.txt", "from one\n");
    await commitIn(two.path, repo, "shared.txt", "from two\n");
    await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "one" });
    return { ...context, two };
  }

  test("is reported as data that can become the next instruction, and changes nothing", async () => {
    const { repo, worktrees } = await conflicting();
    const before = await repo.git("rev-parse", "foreman/run1/integration");

    const result = await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "two" });

    expect(result).toMatchObject({ status: "conflict", files: ["shared.txt"] });
    expect(result.status === "conflict" && result.instruction).toContain("shared.txt");
    expect(result.status === "conflict" && result.instruction).toContain("foreman/run1/task-two");
    expect(await repo.git("rev-parse", "foreman/run1/integration")).toBe(before);
    expect(await repo.git("status", "--porcelain")).toBe("");
  });

  test("merges once the Worker has resolved it in its own worktree", async () => {
    const { repo, worktrees, two } = await conflicting();
    await repo.tryGit("-C", two.path, "merge", "foreman/run1/integration");
    await writeIn(two.path, "shared.txt", "resolved\n");
    await repo.git("-C", two.path, "add", "shared.txt");
    await repo.git("-C", two.path, "commit", "--quiet", "--no-edit");

    const result = await worktrees.mergeTask({ repoDir: repo.path, runId: "run1", taskId: "two" });

    expect(result.status).toBe("merged");
    expect(await repo.git("show", "foreman/run1/integration:shared.txt")).toBe("resolved");
  });
});

describe("no secrets reach a worktree (AC-44)", () => {
  test("an untracked .env in the source checkout isn't in the worktree", async () => {
    const { repo, prepare } = await setup();
    await writeFile(join(repo.path, ".env"), "TOKEN=fake-value\n");
    await writeFile(join(repo.path, ".env.local"), "TOKEN=fake-value\n");

    const task = await prepare("one");

    expect(await readdir(task.path)).not.toContain(".env");
    expect(await readdir(task.path)).not.toContain(".env.local");
  });

  test("copyFiles copies an allowed untracked file", async () => {
    const { repo, prepare } = await setup();
    await mkdir(join(repo.path, "fixtures"));
    await writeFile(join(repo.path, "fixtures", "local.json"), "{}\n");

    const task = await prepare("one", ["fixtures/local.json"]);

    expect(await readFile(join(task.path, "fixtures", "local.json"), "utf8")).toBe("{}\n");
  });

  test.each([".env", "config/.env.production", "keys/server.pem"])(
    "a copyFiles entry matching the deny list (%s) is refused, and nothing is created",
    async (entry) => {
      const { repo, prepare, runDir } = await setup();
      await writeIn(repo.path, entry, "fake-value\n");

      const refusal = await prepare("one", [entry]).catch((error) => error);

      expect(refusal).toBeInstanceOf(WorktreeRefusedError);
      expect(refusal.reason).toContain(entry);
      expect(refusal.reason).toContain("deny-secret-files");
      expect(await exists(join(runDir, "worktrees"))).toBe(false);
      expect(await repo.git("branch", "--list", "foreman/*")).toBe("");
    },
  );

  test("a copyFiles entry that is a symlink out of the checkout is refused", async () => {
    const { repo, prepare } = await setup();
    const outside = join(await makeTempDir(), "outside.txt");
    await writeFile(outside, "outside\n");
    await symlink(outside, join(repo.path, "link.txt"));

    await expect(prepare("one", ["link.txt"])).rejects.toBeInstanceOf(WorktreeRefusedError);
  });

  test("a tracked file matching the deny list blocks the Task with a clear reason", async () => {
    const { repo, prepare, runDir } = await setup({}, { "README.md": "readme\n", "config/.env": "TOKEN=fake-value\n" });

    const refusal = await prepare("one").catch((error) => error);

    expect(refusal).toBeInstanceOf(WorktreeRefusedError);
    expect(refusal.paths).toEqual(["config/.env"]);
    expect(refusal.reason).toContain("config/.env");
    expect(refusal.reason).toContain("deny-secret-files");
    expect(refusal.reason).toContain("built-in");
    expect(await exists(join(runDir, "worktrees"))).toBe(false);
    expect(await repo.git("branch", "--list", "foreman/*")).toBe("");
  });

  test("a tracked .env.example is allowed", async () => {
    const { prepare } = await setup({}, { "README.md": "readme\n", ".env.example": "TOKEN=\n" });

    expect((await prepare("one")).branch).toBe("foreman/run1/task-one");
  });
});

describe("read-only views", () => {
  async function viewed() {
    const context = await setup({}, { "README.md": "readme\n", ".gitignore": "build/\n" });
    await writeFile(join(context.repo.path, ".env"), "TOKEN=fake-value\n");
    const view = await context.worktrees.createView({
      repoDir: context.repo.path,
      baseRef: "main",
      viewDir: join(context.runDir, "views", "catalog-api"),
    });
    return { ...context, view };
  }

  test("is detached at baseRef, has no untracked files, and is reported unmodified", async () => {
    const { repo, worktrees, view } = await viewed();

    expect(view.sha).toBe(await repo.git("rev-parse", "main"));
    expect(await repo.git("-C", view.path, "symbolic-ref", "--quiet", "HEAD").catch(() => "detached")).toBe("detached");
    expect(await repo.git("-C", view.path, "rev-parse", "HEAD")).toBe(view.sha);
    expect(await readdir(view.path)).not.toContain(".env");
    expect(await worktrees.viewChanges(view)).toEqual([]);
  });

  test.each([
    ["an edited tracked file", async (path: string) => writeFile(join(path, "README.md"), "edited\n"), "README.md"],
    ["a new file", async (path: string) => writeFile(join(path, "new.txt"), "x\n"), "new.txt"],
    ["a new ignored file", async (path: string) => writeIn(path, "build/out.js", "x\n"), "build/"],
  ])("detects %s with git", async (_name, modify, expected) => {
    const { worktrees, view } = await viewed();

    await modify(view.path);

    expect(await worktrees.viewChanges(view)).toContain(expected);
  });

  test("detects a commit made in the view", async () => {
    const { repo, worktrees, view } = await viewed();

    await commitIn(view.path, repo, "new.txt", "x\n");

    expect(await worktrees.viewChanges(view)).toEqual(["HEAD moved"]);
  });

  test("a view of a repository that tracks a denied file is refused", async () => {
    const { repo, worktrees, runDir } = await setup({}, { ".env": "TOKEN=fake-value\n" });

    await expect(
      worktrees.createView({ repoDir: repo.path, baseRef: "main", viewDir: join(runDir, "views", "x") }),
    ).rejects.toBeInstanceOf(WorktreeRefusedError);
  });
});

describe("every decision comes through the Check Engine", () => {
  test("a Workspace rule denying a tracked path blocks the Task, and the shipped defaults don't", async () => {
    const files = { "README.md": "readme\n", "vault/data.txt": "data\n" };
    const rule = "{ checkpoints: [worktree.tracked], match: { paths: ['vault/'] }, effect: deny }";

    const changed = await setup({ workspace: layerWithRules({ "deny-vault": rule }) }, files);
    const refusal = await changed.prepare("one").catch((error) => error);
    expect(refusal).toBeInstanceOf(WorktreeRefusedError);
    expect(refusal.reason).toContain("deny-vault");
    expect(refusal.reason).toContain("Workspace");

    const shipped = await setup({}, files);
    expect((await shipped.prepare("one")).branch).toBe("foreman/run1/task-one");
  });

  test("a Workspace rule denying a copyFiles path refuses it, and the shipped defaults don't", async () => {
    const rule = "{ checkpoints: [worktree.copy], match: { paths: ['local.json'] }, effect: deny }";

    const changed = await setup({ workspace: layerWithRules({ "deny-local": rule }) });
    await writeFile(join(changed.repo.path, "local.json"), "{}\n");
    await expect(changed.prepare("one", ["local.json"])).rejects.toBeInstanceOf(WorktreeRefusedError);

    const shipped = await setup();
    await writeFile(join(shipped.repo.path, "local.json"), "{}\n");
    expect((await shipped.prepare("one", ["local.json"])).branch).toBe("foreman/run1/task-one");
  });

  test("relaxing the shipped deny rule to a flag lets a tracked .env through", async () => {
    const changed = await setup(
      { workspace: layerWithRules({ "deny-secret-files": "{ effect: flag }" }) },
      { ".env": "TOKEN=fake-value\n" },
    );

    expect((await changed.prepare("one")).branch).toBe("foreman/run1/task-one");
  });
});
