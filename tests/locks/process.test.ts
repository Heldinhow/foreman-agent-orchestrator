import { expect, test } from "bun:test";
import fs from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { openLedger } from "../../src/ledger/ledger.ts";
import { taskRecord } from "../../src/ledger/reducer.ts";
import { openLocks } from "../../src/locks/locks.ts";
import { fakeIdentity } from "../helpers/ledger.ts";
import { hermeticEnv, repoRoot } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";

const claimantScript = join(repoRoot, "tests", "helpers", "lock-claimant.ts");
const processTestTimeoutMs = 60_000;

const CLAIMANTS = 8;
const TASKS = 120;
const STEP_MS = 15;
/** Long enough for every claimant process to start before the first shared moment. */
const STARTUP_MS = 1500;
const LONG_TTL_MS = 60_000;

function spawnClaimant(
  workspace: string,
  args: string[],
  env: Record<string, string> = hermeticEnv(workspace),
) {
  return Bun.spawn(["bun", claimantScript, workspace, ...args], {
    cwd: workspace,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
}

type Claimant = ReturnType<typeof spawnClaimant>;

interface Report {
  task?: number;
  won?: boolean;
  generation?: number;
  reason?: string;
}

/** Everything a claimant printed, after checking it ran to a clean finish. */
async function reportsOf(claimant: Claimant): Promise<Report[]> {
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(claimant.stdout).text(),
    new Response(claimant.stderr).text(),
    claimant.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as Report);
}

async function raceForEveryTask(workspace: string, ttlMs: number): Promise<Report[]> {
  const startAt = Date.now() + STARTUP_MS;
  const claimants = Array.from({ length: CLAIMANTS }, () =>
    spawnClaimant(workspace, ["race", String(ttlMs), String(startAt), String(STEP_MS), String(TASKS)]),
  );
  return (await Promise.all(claimants.map(reportsOf))).flat();
}

function expectOneWinnerPerTask(reports: Report[], generation: number) {
  expect(reports).toHaveLength(CLAIMANTS * TASKS);
  for (let task = 0; task < TASKS; task++) {
    const forTask = reports.filter((report) => report.task === task);
    const winners = forTask.filter((report) => report.won);
    expect({ task, winners: winners.map((winner) => winner.generation) }).toEqual({
      task,
      winners: [generation],
    });
    expect(forTask.filter((report) => report.won === false)).toHaveLength(CLAIMANTS - 1);
  }
}

function lockedEvents(workspace: string) {
  const ledger = openLedger({ workspace, clock: { now: () => new Date() }, identity: fakeIdentity });
  const loaded = ledger.load();
  expect(loaded.tornLines).toEqual([]);
  return loaded.events.filter((event) => event.type === "task.locked");
}

/** Sends one command to a `hold` claimant and waits for its answer on the next line. */
function holderLines(claimant: Claimant) {
  const reader = claimant.stdout.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  const nextLine = async (): Promise<Record<string, unknown>> => {
    while (!buffered.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`claimant ended early: ${await new Response(claimant.stderr).text()}`);
      buffered += value;
    }
    const end = buffered.indexOf("\n");
    const line = buffered.slice(0, end);
    buffered = buffered.slice(end + 1);
    return JSON.parse(line);
  };
  const send = (command: string) => {
    claimant.stdin.write(`${command}\n`);
    claimant.stdin.flush();
    return nextLine();
  };
  return { nextLine, send };
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? [path, ...walk(path)] : [path];
  });
}

test(
  "AC-17: claimants in separate processes contend for each Task, and exactly one wins, every time",
  async () => {
    const workspace = await makeTempDir();

    const reports = await raceForEveryTask(workspace, LONG_TTL_MS);

    expectOneWinnerPerTask(reports, 1);
    expect(lockedEvents(workspace)).toHaveLength(TASKS);
  },
  processTestTimeoutMs,
);

test(
  "AC-18: concurrent takeovers of expired locks produce exactly one winner, every time",
  async () => {
    const workspace = await makeTempDir();
    // Heartbeats written long ago, so every claimant finds every lock already expired.
    const longAgo = { now: () => new Date(Date.now() - LONG_TTL_MS * 2) };
    const ledger = openLedger({ workspace, clock: longAgo, identity: fakeIdentity });
    const seed = openLocks({ workspace, clock: longAgo, identity: fakeIdentity, ledger, ttlMs: LONG_TTL_MS });
    for (let task = 0; task < TASKS; task++) {
      expect(seed.claimTask("run-1", `task-${task}`).won).toBe(true);
    }

    const reports = await raceForEveryTask(workspace, LONG_TTL_MS);

    expectOneWinnerPerTask(reports, 2);
    expect(lockedEvents(workspace)).toHaveLength(TASKS * 2);
  },
  processTestTimeoutMs,
);

test(
  "AC-18: claimants taking over one Task back to back never win the same generation twice",
  async () => {
    const workspace = await makeTempDir();
    const claimsEach = 150;

    const claimants = Array.from({ length: CLAIMANTS }, () =>
      spawnClaimant(workspace, ["chain", "1", String(claimsEach)]),
    );
    const reports = (await Promise.all(claimants.map(reportsOf))).flat();

    const won = reports.flatMap((report) => (report.won ? [report.generation as number] : []));
    expect(won.length).toBeGreaterThan(1);
    expect(new Set(won).size).toBe(won.length);

    const recorded = lockedEvents(workspace).map((event) => event.generation as number);
    expect(new Set(recorded).size).toBe(recorded.length);
    for (const generation of won) expect(recorded).toContain(generation);
  },
  processTestTimeoutMs,
);

test(
  "AC-19: a live heartbeat held by another process can't be taken over",
  async () => {
    const workspace = await makeTempDir();
    const holder = spawnClaimant(workspace, ["hold", String(LONG_TTL_MS), "task"]);
    const { nextLine } = holderLines(holder);
    expect(await nextLine()).toEqual({ won: true, generation: 1 });

    const rivals = Array.from({ length: CLAIMANTS }, () =>
      spawnClaimant(workspace, ["chain", String(LONG_TTL_MS), "3"]),
    );
    const reports = (await Promise.all(rivals.map(reportsOf))).flat();

    holder.kill("SIGKILL");
    await holder.exited;
    expect(new Set(reports.map((report) => report.reason))).toEqual(new Set(["held"]));
  },
  processTestTimeoutMs,
);

test(
  "a live holder that keeps renewing outlasts its TTL, and a killed one can be taken over",
  async () => {
    const workspace = await makeTempDir();
    const ttlMs = 1000;
    const holder = spawnClaimant(workspace, ["hold", String(ttlMs), "task"]);
    const { nextLine, send } = holderLines(holder);
    expect(await nextLine()).toEqual({ won: true, generation: 1 });

    const claimedAt = Date.now();
    while (Date.now() - claimedAt < ttlMs * 1.5) {
      expect(await send("renew")).toEqual({ command: "renew", ok: true });
      const [refused] = await reportsOf(spawnClaimant(workspace, ["chain", String(ttlMs), "1"]));
      expect(refused).toEqual({ won: false, reason: "held" });
    }

    expect(await send("renew")).toEqual({ command: "renew", ok: true });
    holder.kill("SIGKILL");
    await holder.exited;
    await Bun.sleep(ttlMs);

    const [taken] = await reportsOf(spawnClaimant(workspace, ["chain", String(ttlMs), "1"]));
    expect(taken).toEqual({ won: true, generation: 2 });
  },
  processTestTimeoutMs,
);

test(
  "AC-20: a holder in another process that lost its lock can't renew or close the Task",
  async () => {
    const workspace = await makeTempDir();
    const ttlMs = 200;
    const zombie = spawnClaimant(workspace, ["hold", String(ttlMs), "task"]);
    const { nextLine, send } = holderLines(zombie);
    expect(await nextLine()).toEqual({ won: true, generation: 1 });
    await Bun.sleep(ttlMs);

    const holder = spawnClaimant(workspace, ["hold", String(LONG_TTL_MS), "task"]);
    const current = holderLines(holder);
    expect(await current.nextLine()).toEqual({ won: true, generation: 2 });

    expect(await send("renew")).toEqual({ command: "renew", ok: false, refused: "LockLostError" });
    expect(await send("close")).toEqual({ command: "close", ok: false, refused: "StaleGenerationError" });
    expect(await current.send("close")).toEqual({ command: "close", ok: true });

    zombie.kill("SIGKILL");
    holder.kill("SIGKILL");
    await Promise.all([zombie.exited, holder.exited]);

    const ledger = openLedger({ workspace, clock: { now: () => new Date() }, identity: fakeIdentity });
    const record = taskRecord(ledger.load().state, "run-1", "task-1");
    expect(record?.generation).toBe(2);
    const closes = ledger.load().events.filter((event) => event.type === "task.closed");
    expect(closes.map((event) => event.generation)).toEqual([2]);
    expect(record?.closedBy).toBe(closes[0]?.eventId);
  },
  processTestTimeoutMs,
);

test(
  "a Run has one supervisor across processes",
  async () => {
    const workspace = await makeTempDir();
    const claimants = Array.from({ length: CLAIMANTS }, () =>
      spawnClaimant(workspace, ["hold", String(LONG_TTL_MS), "run"]),
    );

    const firstLines = await Promise.all(
      claimants.map(async (claimant) => {
        const reader = claimant.stdout.pipeThrough(new TextDecoderStream()).getReader();
        const { value } = await reader.read();
        return JSON.parse(value?.split("\n")[0] as string) as Report;
      }),
    );

    for (const claimant of claimants) claimant.kill("SIGKILL");
    await Promise.all(claimants.map((claimant) => claimant.exited));
    expect(firstLines.filter((report) => report.won).map((report) => report.generation)).toEqual([1]);
  },
  processTestTimeoutMs,
);

test(
  "a holder killed mid-renewal leaves its last heartbeat whole, and the Task recoverable",
  async () => {
    const workspace = await makeTempDir();
    const ttlMs = 500;
    const claimant = spawnClaimant(workspace, ["stall-mid-renew", String(ttlMs)]);
    const { value } = await claimant.stdout.getReader().read();
    expect(new TextDecoder().decode(value)).toContain("mid-renew");
    claimant.kill("SIGKILL");
    await claimant.exited;

    const directory = join(workspace, "memory", "locks", "run-1", "tasks", "task-1");
    const record = JSON.parse(fs.readFileSync(join(directory, "g1.lock"), "utf8"));
    expect(record).toMatchObject({ generation: 1, ttlMs });

    await Bun.sleep(ttlMs);
    const [taken] = await reportsOf(spawnClaimant(workspace, ["chain", String(ttlMs), "1"]));
    expect(taken).toEqual({ won: true, generation: 2 });
    expect(fs.readdirSync(directory)).toEqual(["g2.lock"]);
  },
  processTestTimeoutMs,
);

test(
  "AC-55: with a sentinel HOME and USER, lock files hold only a token, generation, heartbeat and TTL",
  async () => {
    const home = join(await makeTempDir(), "sentinel-home-value");
    const workspace = join(home, "workspaces", "sample");
    fs.mkdirSync(workspace, { recursive: true });
    const env = { ...hermeticEnv(home), USER: "sentinel-user-value", LOGNAME: "sentinel-user-value" };
    const ttlMs = 200;

    const expired = spawnClaimant(workspace, ["hold", String(ttlMs), "task"], env);
    const first = holderLines(expired);
    expect(await first.nextLine()).toEqual({ won: true, generation: 1 });
    expect(await first.send("renew")).toEqual({ command: "renew", ok: true });
    expired.kill("SIGKILL");
    await expired.exited;
    await Bun.sleep(ttlMs);

    const holder = spawnClaimant(workspace, ["hold", String(LONG_TTL_MS), "task"], env);
    const second = holderLines(holder);
    expect(await second.nextLine()).toEqual({ won: true, generation: 2 });
    const supervisor = spawnClaimant(workspace, ["hold", String(LONG_TTL_MS), "run"], env);
    expect(await holderLines(supervisor).nextLine()).toEqual({ won: true, generation: 1 });
    holder.kill("SIGKILL");
    supervisor.kill("SIGKILL");
    await Promise.all([holder.exited, supervisor.exited]);

    const root = join(workspace, "memory", "locks");
    const paths = walk(root);
    const lockFiles = paths.filter((path) => path.endsWith(".lock"));
    expect(lockFiles).toHaveLength(2);

    for (const path of paths) {
      const relative = path.slice(root.length);
      expect(relative).not.toContain("sentinel");
      expect(relative).not.toContain(hostname());
    }
    for (const path of lockFiles) {
      const text = fs.readFileSync(path, "utf8");
      expect(text).not.toContain("sentinel-home-value");
      expect(text).not.toContain("sentinel-user-value");
      expect(text).not.toContain(hostname());
      expect(text).not.toContain(home);

      const record = JSON.parse(text);
      expect(Object.keys(record).sort()).toEqual(["generation", "heartbeatAt", "token", "ttlMs"]);
      expect(record.token).toMatch(/^[0-9a-f]{32}$/);
      expect(record.generation).toBeNumber();
      expect(record.heartbeatAt).toBeNumber();
      expect(record.ttlMs).toBeNumber();
    }
  },
  processTestTimeoutMs,
);
