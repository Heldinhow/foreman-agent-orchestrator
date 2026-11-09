import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
 * A Worker: a real child process that plays one turn of its scenario in the cwd and with
 * the exact environment it was given. It's started with its session directory as both.
 */
const [sessionDir, turnArgument] = process.argv.slice(2) as [string, string];
const turn = Number(turnArgument);
const HANG_LIMIT_MS = 5 * 60_000;
const fence = "```";

function writeSessionFile(file: string, value: unknown): void {
  const path = join(sessionDir, file);
  writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

function readSessionFile<Value>(file: string): Value {
  return JSON.parse(readFileSync(join(sessionDir, file), "utf8")) as Value;
}

class TurnFailed extends Error {
  constructor(
    readonly category: string,
    message: string,
  ) {
    super(message);
  }
}

function git(subcommand: string, ...args: string[]): void {
  const child = Bun.spawnSync(["git", ...args], { env: process.env, stdout: "pipe", stderr: "pipe" });
  if (child.exitCode !== 0) {
    throw new TurnFailed("worker_error", `git ${subcommand} failed: ${child.stderr.toString()}`);
  }
}

function readAttempt(path: string, denied: boolean): string {
  if (denied) return `read ${path}: denied by the Guard Policy`;
  try {
    return `read ${path}: ${readFileSync(path, "utf8")}`;
  } catch {
    return `read ${path}: no such file`;
  }
}

async function play(action: Action, say: (text: string) => void): Promise<void> {
  if ("edit" in action) {
    mkdirSync(dirname(action.edit.path), { recursive: true });
    writeFileSync(action.edit.path, action.edit.content);
  } else if ("commit" in action) {
    git("add", "add", "--all");
    git("commit", "-c", "user.name=Fake Worker", "-c", "user.email=worker@example.invalid", "commit", "--quiet", "-m", action.commit);
  } else if ("say" in action) {
    say(action.say);
  } else if ("result" in action) {
    say(`${fence}foreman-result\n${JSON.stringify(action.result)}\n${fence}`);
  } else if ("ask" in action) {
    say(`${fence}foreman-question\n${action.ask}\n${fence}`);
  } else if ("fail" in action) {
    throw new TurnFailed(action.fail.category, action.fail.message);
  } else if ("badOutput" in action) {
    say(action.badOutput);
  } else if ("hang" in action) {
    // A limit, so a test that dies before it cancels can't leave this running for good.
    await Bun.sleep(HANG_LIMIT_MS);
  } else if ("read" in action) {
    say(readAttempt(action.read.path, action.read.denied));
  } else {
    say(readSessionFile<string[]>(MESSAGES_FILE).at(-1) ?? "");
  }
}

async function playTurn(plan: WorkerPlan): Promise<TurnOutcome> {
  const actions = plan.turns[turn];
  if (actions === undefined) {
    return { state: "failed", category: "worker_error", message: `the scenario has no turn ${turn}` };
  }
  const parts: string[] = [];
  try {
    for (const action of actions) await play(action, (text) => parts.push(text));
    return { state: "finished", message: parts.join("\n\n") };
  } catch (error) {
    if (error instanceof TurnFailed) return { state: "failed", category: error.category, message: error.message };
    return { state: "failed", category: "worker_error", message: (error as Error).message };
  }
}

const plan = readSessionFile<WorkerPlan>(PLAN_FILE);
process.chdir(plan.cwd);

const observed: TurnObservation = {
  env: process.env as Record<string, string>,
  cwd: process.cwd(),
  model: plan.model,
  readOnly: plan.readOnly,
};
writeSessionFile(turnFile(turn, "observed"), observed);
writeSessionFile(turnFile(turn, "outcome"), await playTurn(plan));
