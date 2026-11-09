import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildWorkerEnv, type WorkerEnvRequest } from "../../src/guard/worker-env.ts";
import { createTempRepo } from "../helpers/git.ts";
import { layerWithRules, policySnapshot } from "../helpers/policy.ts";
import { run } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import type { WorkspaceFixture } from "../helpers/workspace.ts";

/** Token-shaped values are built at run time, so no secret-looking literal is committed. */
const canary = (label: string) => `canary-${label}-${["x", "y", "z"].join("")}`;

async function request(policy: WorkspaceFixture = {}, extra: Partial<WorkerEnvRequest> = {}) {
  const repo = await createTempRepo();
  await repo.commitFile("README.md", "readme\n", "add readme");
  return {
    supervisorEnv: {
      PATH: process.env.PATH ?? "",
      HOME: await makeTempDir(),
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TERM: "xterm",
      TMPDIR: "/tmp",
      SUPERVISOR_CANARY: canary("supervisor"),
      GH_TOKEN: canary("gh"),
      SSH_AUTH_SOCK: "/run/agent.sock",
      EXAMPLE_PROVIDER_API_KEY: canary("provider"),
    },
    policy: await policySnapshot(policy),
    adapter: "agent",
    runId: "run1",
    taskId: "task1",
    stateDir: await makeTempDir(),
    worktree: repo.path,
    ...extra,
  } satisfies WorkerEnvRequest;
}

/** What a real child process sees as its environment. */
async function printedEnvironment(env: Record<string, string>): Promise<Record<string, string>> {
  const result = await run(["env"], { cwd: await makeTempDir(), env });
  expect(result.exitCode).toBe(0);
  return Object.fromEntries(
    result.stdout
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

const withPassthrough = (...names: string[]): WorkspaceFixture => ({
  workspace: `schemaVersion: 1\nadapters:\n  agent:\n    type: fake\n    env: { passthrough: [${names.join(", ")}] }\n`,
});

test("AC-5: a Worker receives exactly the built environment, and a supervisor canary isn't visible", async () => {
  const req = await request();

  const { env } = await buildWorkerEnv(req);
  const seen = await printedEnvironment(env);

  expect(seen).toEqual(env);
  expect(JSON.stringify(seen)).not.toContain(req.supervisorEnv.SUPERVISOR_CANARY);
  expect(Object.keys(seen)).not.toContain("SUPERVISOR_CANARY");
  expect(seen.PATH).toBe(req.supervisorEnv.PATH);
  expect(seen.HOME).toBe(req.supervisorEnv.HOME);
  expect(seen.LC_ALL).toBe("C.UTF-8");
  expect(seen.GIT_TERMINAL_PROMPT).toBe("0");
});

test("the Worker's environment allowlist comes from Policy", async () => {
  const req = await request({
    workspace: "schemaVersion: 1\npolicies:\n  guard:\n    env:\n      allow: [PATH, HOME, SUPERVISOR_CANARY]\n",
  });

  const { env } = await buildWorkerEnv(req);

  expect(env.SUPERVISOR_CANARY).toBe(req.supervisorEnv.SUPERVISOR_CANARY);
  expect(env.LANG).toBeUndefined();
});

test("a provider credential reaches the Worker only when its Adapter's Policy names it", async () => {
  const without = await buildWorkerEnv(await request());
  const named = await buildWorkerEnv(await request(withPassthrough("EXAMPLE_PROVIDER_API_KEY")));

  expect(without.env.EXAMPLE_PROVIDER_API_KEY).toBeUndefined();
  expect(named.env.EXAMPLE_PROVIDER_API_KEY).toBe(canary("provider"));
  expect(named.refused).toEqual([]);
});

test("AC-46: a refused credential name in env.passthrough isn't passed", async () => {
  const req = await request(withPassthrough("EXAMPLE_PROVIDER_API_KEY", "GH_TOKEN", "SSH_AUTH_SOCK"));

  const { env, refused } = await buildWorkerEnv(req);
  const seen = await printedEnvironment(env);

  expect(refused).toEqual(["GH_TOKEN", "SSH_AUTH_SOCK"]);
  expect(seen.GH_TOKEN).toBeUndefined();
  expect(seen.SSH_AUTH_SOCK).toBeUndefined();
  expect(JSON.stringify(seen)).not.toContain(canary("gh"));
  expect(seen.EXAMPLE_PROVIDER_API_KEY).toBe(canary("provider"));
});

test("a credential name that a Remote or deploy config declares is refused too", async () => {
  const req = await request(withPassthrough("EXAMPLE_PROVIDER_API_KEY"), {
    credentialNames: ["EXAMPLE_PROVIDER_API_KEY"],
  });

  const { env, refused } = await buildWorkerEnv(req);

  expect(env.EXAMPLE_PROVIDER_API_KEY).toBeUndefined();
  expect(refused).toEqual(["EXAMPLE_PROVIDER_API_KEY"]);
});

test("AC-46: a refused name passes once a Policy Layer has relaxed the rule that refuses it", async () => {
  const relaxed = withPassthrough("GH_TOKEN");
  relaxed.override = layerWithRules({ "deny-credential-env": "{ enabled: false }" });

  const { env, refused } = await buildWorkerEnv(await request(relaxed));

  expect(env.GH_TOKEN).toBe(canary("gh"));
  expect(refused).toEqual([]);
});

test("FOREMAN_WORKER, FOREMAN_RUN_ID and FOREMAN_TASK_ID are always set, and Policy can't remove or change them", async () => {
  const req = await request({
    workspace: [
      "schemaVersion: 1",
      "adapters:",
      "  agent:",
      "    type: fake",
      "    env: { passthrough: [FOREMAN_WORKER, FOREMAN_RUN_ID] }",
      "policies:",
      "  guard:",
      "    env:",
      "      allow: [PATH, FOREMAN_TASK_ID]",
      "    git:",
      "      workerEnv: { FOREMAN_WORKER: '0' }",
      "",
    ].join("\n"),
  });
  const supervisorEnv = { ...req.supervisorEnv, FOREMAN_WORKER: "0", FOREMAN_RUN_ID: "other", FOREMAN_TASK_ID: "other" };

  const { env } = await buildWorkerEnv({ ...req, supervisorEnv });

  expect(env.FOREMAN_WORKER).toBe("1");
  expect(env.FOREMAN_RUN_ID).toBe("run1");
  expect(env.FOREMAN_TASK_ID).toBe("task1");
});

test("each Project in scope gets its FOREMAN_WORKTREE_ variable", async () => {
  const req = await request({}, { worktrees: { "catalog-api": "/work/catalog" } });

  const { env } = await buildWorkerEnv(req);

  expect(env.FOREMAN_WORKTREE_CATALOG_API).toBe("/work/catalog");
});

test("GH_CONFIG_DIR points at an empty directory that Foreman made", async () => {
  const req = await request();

  const { env } = await buildWorkerEnv(req);

  expect(env.GH_CONFIG_DIR?.startsWith(req.stateDir)).toBe(true);
  expect(await readdir(env.GH_CONFIG_DIR as string)).toEqual([]);
});
