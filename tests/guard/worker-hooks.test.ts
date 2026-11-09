import { expect, test } from "bun:test";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildWorkerEnv } from "../../src/guard/worker-env.ts";
import { createBareRepo, createTempRepo } from "../helpers/git.ts";
import { policySnapshot } from "../helpers/policy.ts";
import { hermeticEnv, run } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import type { WorkspaceFixture } from "../helpers/workspace.ts";

const IDENTITY = ["-c", "user.name=Test Author", "-c", "user.email=author@example.invalid"];

async function workerIn(policy: WorkspaceFixture = {}) {
  const repo = await createTempRepo();
  await repo.commitFile("README.md", "readme\n", "add readme");
  const home = await makeTempDir();
  const supervisorEnv = {
    ...hermeticEnv(home),
    GIT_CONFIG_GLOBAL: join(home, "gitconfig"),
  };
  const { env } = await buildWorkerEnv({
    supervisorEnv,
    policy: await policySnapshot(policy),
    adapter: "agent",
    runId: "run1",
    taskId: "task1",
    stateDir: await makeTempDir(),
    worktree: repo.path,
  });
  const git = (...args: string[]) => run(["git", ...IDENTITY, ...args], { cwd: repo.path, env });
  return { repo, env, git };
}

const configOf = (repo: { path: string }) => readFile(join(repo.path, ".git", "config"), "utf8");

test("AC-47: a Worker's git push is blocked by the injected hook, with no change to the repository's config", async () => {
  const { repo, git } = await workerIn();
  const target = await createBareRepo();
  await repo.git("remote", "add", "origin", target.path);
  const before = await configOf(repo);

  const push = await git("push", "origin", "main");

  expect(push.exitCode).not.toBe(0);
  expect(push.stderr).toContain("Foreman");
  expect(await target.git("for-each-ref")).toBe("");
  expect(await configOf(repo)).toBe(before);
  expect(await repo.git("config", "--local", "--get-all", "core.hooksPath").catch(() => "unset")).toBe("unset");
});

test("the same push succeeds without the injected hook, so the block is the hook's", async () => {
  const repo = await createTempRepo();
  await repo.commitFile("README.md", "readme\n", "add readme");
  const target = await createBareRepo();
  await repo.git("remote", "add", "origin", target.path);

  const push = await run(["git", "push", "origin", "main"], { cwd: repo.path, env: hermeticEnv(await makeTempDir()) });

  expect(push.exitCode).toBe(0);
  expect(await target.git("for-each-ref")).toContain("refs/heads/main");
});

test("a Project's own pre-commit hook still runs, and a failing one still blocks the commit", async () => {
  const { repo, git } = await workerIn();
  const hook = join(repo.path, ".git", "hooks", "pre-commit");
  const marker = join(repo.path, "hook-ran");
  await writeFile(hook, `#!/bin/sh\necho ran > '${marker}'\n[ ! -e '${repo.path}/block' ]\n`);
  await chmod(hook, 0o755);
  await writeFile(join(repo.path, "a.txt"), "a\n");
  await git("add", "a.txt");

  const allowed = await git("commit", "--quiet", "--message", "a");
  expect(allowed.stderr).toBe("");
  expect(allowed.exitCode).toBe(0);
  expect(await readFile(marker, "utf8")).toBe("ran\n");

  await writeFile(join(repo.path, "block"), "");
  await writeFile(join(repo.path, "b.txt"), "b\n");
  await git("add", "b.txt");
  expect((await git("commit", "--quiet", "--message", "b")).exitCode).not.toBe(0);
});

test("a hook directory that the Project's configuration names is the one chained", async () => {
  const repo = await createTempRepo();
  await repo.commitFile("README.md", "readme\n", "add readme");
  const hooks = join(repo.path, ".custom-hooks");
  await mkdir(hooks);
  const marker = join(repo.path, "custom-ran");
  await writeFile(join(hooks, "pre-commit"), `#!/bin/sh\necho ran > '${marker}'\n`);
  await chmod(join(hooks, "pre-commit"), 0o755);
  await repo.git("config", "core.hooksPath", ".custom-hooks");
  const home = await makeTempDir();
  const { env } = await buildWorkerEnv({
    supervisorEnv: { ...hermeticEnv(home), GIT_CONFIG_GLOBAL: join(home, "gitconfig") },
    policy: await policySnapshot(),
    adapter: "agent",
    runId: "run1",
    taskId: "task1",
    stateDir: await makeTempDir(),
    worktree: repo.path,
  });
  await writeFile(join(repo.path, "a.txt"), "a\n");
  await repo.git("add", "a.txt");

  const commit = await run(["git", ...IDENTITY, "commit", "--quiet", "--message", "a"], { cwd: repo.path, env });

  expect(commit.exitCode).toBe(0);
  expect(await stat(marker).then(() => true, () => false)).toBe(true);
});

test("which hooks a Worker can't run comes from Policy", async () => {
  const { repo, git } = await workerIn({
    workspace: "schemaVersion: 1\npolicies:\n  guard:\n    git:\n      workerRejectedHooks: [pre-push, pre-commit]\n",
  });
  await writeFile(join(repo.path, "a.txt"), "a\n");
  await git("add", "a.txt");

  const commit = await git("commit", "--quiet", "--message", "a");

  expect(commit.exitCode).not.toBe(0);
  expect(commit.stderr).toContain("Foreman");
});

test("a Policy Layer that stops rejecting pre-push lets the Worker's push through", async () => {
  const { repo, git } = await workerIn({
    workspace: "schemaVersion: 1\npolicies:\n  guard:\n    git:\n      workerRejectedHooks: []\n",
  });
  const target = await createBareRepo();
  await repo.git("remote", "add", "origin", target.path);

  expect((await git("push", "origin", "main")).exitCode).toBe(0);
});
