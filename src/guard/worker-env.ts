import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { evaluate, type PolicySnapshot } from "../check/engine.ts";
import { worktreeEnvName } from "../config/workspace-config.ts";
import { projectHooksDir, writeHookDir } from "./worker-hooks.ts";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface WorkerEnvRequest {
  /** The supervisor's own environment, of which a Worker gets only what Policy allows. */
  supervisorEnv: Readonly<Record<string, string | undefined>>;
  policy: PolicySnapshot;
  /** The Adapter's name in Policy, whose `env.passthrough` is added to the allowlist. */
  adapter: string;
  runId: string;
  taskId: string;
  /** A directory Foreman owns for this Worker, where its hooks and empty directories go. */
  stateDir: string;
  /** The worktree whose Project hooks are chained. */
  worktree: string;
  /** Names that a Remote or deploy config declares as credentials, which are never passed. */
  credentialNames?: readonly string[];
  /** Each Project in scope and its worktree, as `FOREMAN_WORKTREE_*` variables. */
  worktrees?: Readonly<Record<string, string>>;
}

export interface WorkerEnvironment {
  /** The exact environment the Worker starts with. */
  env: Record<string, string>;
  /** Names that were asked for, by the allowlist or by passthrough, and refused. */
  refused: string[];
}

const matches = (pattern: string, name: string) =>
  pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name;

/**
 * Builds a Worker's environment from nothing (ADR-0036, ADR-0058). Names come from
 * `guard.env.allow` and the Adapter's `env.passthrough`, and each is judged at
 * `env.passthrough`, so a credential is refused whichever list names it. Policy's git
 * settings follow, then the `FOREMAN_` variables that only the mechanism sets, so Policy
 * can't remove or change them.
 */
export async function buildWorkerEnv(request: WorkerEnvRequest): Promise<WorkerEnvironment> {
  const { supervisorEnv, policy, adapter, runId, taskId, stateDir, worktree } = request;
  const { guard } = policy.policy.policies;
  const passthrough = policy.policy.adapters[adapter]?.env?.passthrough ?? [];
  const allowed = Object.keys(supervisorEnv).filter(
    (name) => ENV_NAME.test(name) && guard.env.allow.some((pattern) => matches(pattern, name)),
  );

  const env: Record<string, string> = {};
  const refused: string[] = [];
  for (const name of new Set([...allowed, ...passthrough])) {
    const credential = request.credentialNames?.includes(name) ?? false;
    const passes = ENV_NAME.test(name) && !credential && evaluate("env.passthrough", { path: name }, policy).effect === "allow";
    if (!passes) refused.push(name);
    else if (supervisorEnv[name] !== undefined) env[name] = supervisorEnv[name];
  }

  Object.assign(env, guard.git.workerEnv);
  if (guard.git.emptyDirEnv.length > 0) {
    const empty = join(stateDir, "empty");
    await mkdir(empty, { recursive: true });
    for (const name of guard.git.emptyDirEnv) env[name] = empty;
  }

  const hooks = join(stateDir, "hooks");
  await writeHookDir({
    dir: hooks,
    chainTo: await projectHooksDir(worktree, env),
    rejected: guard.git.workerRejectedHooks,
  });
  Object.assign(env, {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: hooks,
  });

  for (const [project, path] of Object.entries(request.worktrees ?? {})) env[worktreeEnvName(project)] = path;
  Object.assign(env, { FOREMAN_WORKER: "1", FOREMAN_RUN_ID: runId, FOREMAN_TASK_ID: taskId });
  return { env, refused };
}
