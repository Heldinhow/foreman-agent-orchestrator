import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
  FAILURE_CATEGORIES,
  type Adapter,
  type GuardPolicy,
  type WorkerHandle,
  type WorkerSpec,
  type WorkerStatus,
} from "../../../../src/adapters/contract.ts";
import type { AdapterContext } from "../../../../src/adapters/local-module.ts";
import { statusFromFinalMessage } from "../../../../src/adapters/worker-output.ts";
import { evaluate, type PolicySnapshot } from "../../../../src/check/engine.ts";
import type { Policy } from "../../../../src/policy/schema.ts";
import {
  MESSAGES_FILE,
  PLAN_FILE,
  turnFile,
  type Action,
  type TurnObservation,
  type TurnOutcome,
  type WorkerPlan,
} from "./protocol.ts";

/**
 * The fake Adapter: a local module that plays a declarative scenario through real child
 * processes, so nothing in `src/` knows about it. The scenario lives in the Workspace:
 *
 *   enforcesPolicy: true
 *   workers:
 *     - match: { prompt: "implement", task: "task-1" }    # first match wins; both optional
 *       misreportDiff: "what diff should wrongly report"  # optional
 *       turns:                                            # `start` plays the first, each `send` the next
 *         - - edit: { path: a.txt, content: "text\n" }    # stays uncommitted without a commit
 *           - commit: Add a
 *           - say: Some text for the final message
 *           - result: { summary: done }                   # a `foreman-result` block
 *         - - ask: Which one?                             # a `foreman-question` block
 *         - - fail: { category: rate_limited, message: Too many requests }
 *         - - badOutput: "any raw text for the final message"
 *         - - hang: true
 *         - - read: .env                                  # says what it read, unless Policy denies it
 *         - - echoLastMessage: true                       # says the last message it was sent
 */
export const SCENARIO_FILE = "fake-adapter.yaml";

const ActionSchema = z.union([
  z.strictObject({ edit: z.strictObject({ path: z.string().min(1), content: z.string() }) }),
  z.strictObject({ commit: z.string().min(1) }),
  z.strictObject({ say: z.string() }),
  z.strictObject({ result: z.unknown() }),
  z.strictObject({ ask: z.string() }),
  z.strictObject({ fail: z.strictObject({ category: z.enum(FAILURE_CATEGORIES), message: z.string().min(1) }) }),
  z.strictObject({ badOutput: z.string() }),
  z.strictObject({ hang: z.literal(true) }),
  z.strictObject({ read: z.string().min(1) }),
  z.strictObject({ echoLastMessage: z.literal(true) }),
]);

const ScenarioSchema = z.strictObject({
  enforcesPolicy: z.boolean(),
  workers: z
    .array(
      z.strictObject({
        match: z.strictObject({ prompt: z.string().optional(), task: z.string().optional() }).optional(),
        misreportDiff: z.string().optional(),
        turns: z.array(z.array(ActionSchema)).min(1),
      }),
    )
    .optional(),
});

export type FakeScenario = z.input<typeof ScenarioSchema>;
type WorkerScenario = NonNullable<z.output<typeof ScenarioSchema>["workers"]>[number];

const SESSION_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ADAPTER_ID = "fake";
const KILL_WAIT_MS = 2_000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The Check Engine decides what an enforcing Worker is denied, from the rules in its spec. */
function deniedByPolicy(path: string, guard: GuardPolicy): boolean {
  const snapshot = {
    policy: { policies: { guard } } as unknown as Policy,
    explain: () => [{ setBy: { name: "built-in" } }],
  } as unknown as PolicySnapshot;
  return evaluate("adapter.render", { path }, snapshot).effect === "deny";
}

function readScenario(workspaceDir: string) {
  const file = join(workspaceDir, SCENARIO_FILE);
  return ScenarioSchema.parse(parse(readFileSync(file, "utf8")));
}

function selectWorker(workers: readonly WorkerScenario[], spec: WorkerSpec): WorkerScenario {
  const worker = workers.find(({ match }) => {
    if (match?.prompt !== undefined && !spec.prompt.includes(match.prompt)) return false;
    return match?.task === undefined || spec.env.FOREMAN_TASK_ID === match.task;
  });
  if (worker === undefined) throw new Error(`fake Adapter: no scenario matches the prompt ${JSON.stringify(spec.prompt)}`);
  return worker;
}

export function sessionDirectory(workspaceDir: string, handle: WorkerHandle): string | undefined {
  if (handle.adapterId !== ADAPTER_ID || !SESSION_REF.test(handle.sessionRef)) return undefined;
  const dir = join(workspaceDir, ".fake-adapter", "sessions", handle.sessionRef);
  return existsSync(dir) ? dir : undefined;
}

function readJson<Value>(path: string): Value | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Value) : undefined;
}

function latestTurn(dir: string): number {
  let turn = 0;
  while (existsSync(join(dir, turnFile(turn + 1, "pid")))) turn++;
  return turn;
}

function workerPid(dir: string): number {
  return readJson<number>(join(dir, turnFile(latestTurn(dir), "pid"))) as number;
}

/** What a fake Worker process really saw on its latest turn, for tests to assert on. */
export function readObservation(workspaceDir: string, handle: WorkerHandle) {
  const dir = sessionDirectory(workspaceDir, handle) as string;
  return {
    ...(readJson<TurnObservation>(join(dir, turnFile(latestTurn(dir), "observed"))) as TurnObservation),
    messages: readJson<string[]>(join(dir, MESSAGES_FILE)) as string[],
  };
}

export function fakeWorkerPid(workspaceDir: string, handle: WorkerHandle): number {
  return workerPid(sessionDirectory(workspaceDir, handle) as string);
}

export function fakeWorkerAlive(workspaceDir: string, handle: WorkerHandle): boolean {
  return isAlive(fakeWorkerPid(workspaceDir, handle));
}

export default function createFakeAdapter({ workspaceDir }: AdapterContext): Adapter {
  const scenario = readScenario(workspaceDir);

  function spawnTurn(dir: string, spec: Pick<WorkerSpec, "env">, turn: number): void {
    // Started from the session directory, so Bun finds no `.env` or `bunfig.toml` of the Worker's cwd.
    const child = Bun.spawn(
      [process.execPath, "--no-install", join(import.meta.dir, "worker.ts"), dir, String(turn)],
      {
        cwd: dir,
        env: spec.env,
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: Bun.file(join(dir, `turn-${turn}.stderr.log`)),
      },
    );
    child.unref();
    writeFileSync(join(dir, turnFile(turn, "pid")), JSON.stringify(child.pid));
  }

  function currentStatus(dir: string): WorkerStatus {
    if (existsSync(join(dir, "cancelled"))) return { state: "cancelled" };
    const turn = latestTurn(dir);
    const finished = () => {
      const outcome = readJson<TurnOutcome>(join(dir, turnFile(turn, "outcome")));
      if (outcome === undefined) return undefined;
      if (outcome.state === "finished") return statusFromFinalMessage(outcome.message);
      return outcome as WorkerStatus;
    };
    const before = finished();
    if (before !== undefined) return before;
    if (isAlive(workerPid(dir))) return { state: "running" };
    // It can have finished between the first look and the liveness check.
    return (
      finished() ?? { state: "failed", category: "worker_error", message: "the Worker's process died with no result" }
    );
  }

  /** The output of a git command, or nothing if it can't run, as with no `PATH` in the environment. */
  function git(cwd: string, env: Record<string, string>, ...args: string[]): string {
    try {
      return Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "ignore" }).stdout.toString();
    } catch {
      return "";
    }
  }

  return {
    id: ADAPTER_ID,
    capabilities: {
      enforcesPolicy: scenario.enforcesPolicy,
      resumableSessions: true,
      modelSelection: true,
      readOnly: true,
    },

    async start(spec) {
      if (!statSync(spec.cwd, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error("fake Adapter: the Worker's cwd isn't a directory");
      }
      const worker = selectWorker(readScenario(workspaceDir).workers ?? [], spec);
      const resolve = (action: z.output<typeof ActionSchema>): Action =>
        "read" in action
          ? { read: { path: action.read, denied: scenario.enforcesPolicy && deniedByPolicy(action.read, spec.policy) } }
          : (action as Action);

      const plan: WorkerPlan = {
        cwd: spec.cwd,
        turns: worker.turns.map((turn) => turn.map(resolve)),
        model: spec.model,
        readOnly: spec.readOnly,
      };
      const handle = { adapterId: ADAPTER_ID, sessionRef: randomUUID() };
      const dir = join(workspaceDir, ".fake-adapter", "sessions", handle.sessionRef);
      mkdirSync(dir, { recursive: true });
      const write = (file: string, value: unknown) =>
        writeFileSync(join(dir, file), JSON.stringify(value), { mode: 0o600 });
      write(PLAN_FILE, plan);
      write("env.json", spec.env);
      write(MESSAGES_FILE, []);
      write("diff.json", {
        base: git(spec.cwd, spec.env, "rev-parse", "--verify", "--quiet", "HEAD").trim(),
        misreport: worker.misreportDiff,
      });
      spawnTurn(dir, spec, 0);
      return handle;
    },

    async send(handle, message) {
      const dir = sessionDirectory(workspaceDir, handle);
      if (dir === undefined) throw new Error("fake Adapter: no such session");
      const { state } = currentStatus(dir);
      if (state !== "waiting_input" && state !== "completed") {
        throw new Error(`fake Adapter: can't send to a Worker that is ${state}`);
      }
      const messages = readJson<string[]>(join(dir, MESSAGES_FILE)) as string[];
      writeFileSync(join(dir, MESSAGES_FILE), JSON.stringify([...messages, message]), { mode: 0o600 });
      const env = readJson<Record<string, string>>(join(dir, "env.json")) as Record<string, string>;
      spawnTurn(dir, { env }, latestTurn(dir) + 1);
    },

    async status(handle) {
      const dir = sessionDirectory(workspaceDir, handle);
      return dir === undefined ? { state: "unknown" } : currentStatus(dir);
    },

    async diff(handle) {
      const dir = sessionDirectory(workspaceDir, handle);
      if (dir === undefined) throw new Error("fake Adapter: no such session");
      const { base, misreport } = readJson<{ base: string; misreport?: string }>(join(dir, "diff.json")) as {
        base: string;
        misreport?: string;
      };
      if (misreport !== undefined) return misreport;

      const { cwd } = readJson<WorkerPlan>(join(dir, PLAN_FILE)) as WorkerPlan;
      const env = readJson<Record<string, string>>(join(dir, "env.json")) as Record<string, string>;
      const tracked = base === "" ? "" : git(cwd, env, "diff", base);
      const untracked = git(cwd, env, "ls-files", "--others", "--exclude-standard", "-z")
        .split("\0")
        .filter((file) => file !== "")
        .map((file) => git(cwd, env, "diff", "--no-index", "--", "/dev/null", file));
      return [tracked, ...untracked].join("");
    },

    async cancel(handle) {
      const dir = sessionDirectory(workspaceDir, handle);
      if (dir === undefined) return;
      const { state } = currentStatus(dir);
      if (state === "completed" || state === "failed" || state === "cancelled") return;

      writeFileSync(join(dir, "cancelled"), "");
      const pid = workerPid(dir);
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // It has already gone.
      }
      const deadline = Date.now() + KILL_WAIT_MS;
      while (isAlive(pid) && Date.now() < deadline) await Bun.sleep(5);
    },
  };
}
