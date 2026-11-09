import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { openLedger } from "../../src/ledger/ledger.ts";
import { unfinishedActions } from "../../src/ledger/reducer.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";
import { hermeticEnv, repoRoot, run } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";

const writerScript = join(repoRoot, "tests", "helpers", "ledger-writer.ts");

function spawnWriter(workspace: string, env: Record<string, string>, ...args: string[]) {
  return Bun.spawn(["bun", writerScript, workspace, ...args], {
    cwd: workspace,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}

const openHere = (workspace: string) =>
  openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });

const killTestTimeoutMs = 60_000;

/** Waits for the writer's first line of output, which says it reached the point to kill at. */
async function firstLine(writer: ReturnType<typeof spawnWriter>) {
  const { value } = await writer.stdout.getReader().read();
  return new TextDecoder().decode(value).trim();
}

/** A real writer, inside its append with half the line written, killed by a real signal. */
async function killWriterMidAppend(workspace: string) {
  const ledger = openHere(workspace);
  ledger.append({ type: "run.started", runId: "before-the-crash" });
  const path = join(workspace, "memory", "ledger.jsonl");
  const sizeBefore = statSync(path).size;

  const writer = spawnWriter(workspace, hermeticEnv(workspace), "stall-mid-append");
  expect(await firstLine(writer)).toBe("mid-append");
  writer.kill("SIGKILL");
  expect(await writer.exited).not.toBe(0);

  return { ledger, path, sizeBefore };
}

test(
  "AC-51: killing a writer mid-append leaves a Ledger that loads and reports the torn line",
  async () => {
    const workspace = await makeTempDir();

    const { ledger, path, sizeBefore } = await killWriterMidAppend(workspace);

    const loaded = ledger.load();
    expect(loaded.events.map((event) => event.runId)).toEqual(["before-the-crash"]);
    expect(loaded.tornLines).toEqual([
      { line: 2, byteOffset: sizeBefore, byteLength: statSync(path).size - sizeBefore },
    ]);
    expect(loaded.tornLines[0]?.byteLength).toBeGreaterThan(0);
  },
  killTestTimeoutMs,
);

test(
  "AC-51: the Ledger keeps working after a killed writer, and the earlier bytes are untouched",
  async () => {
    const workspace = await makeTempDir();
    const { ledger, path } = await killWriterMidAppend(workspace);
    const before = await readFile(path);

    ledger.append({ type: "run.started", runId: "after-the-crash" });

    const after = await readFile(path);
    expect(after.subarray(0, before.length).equals(before)).toBe(true);
    const loaded = ledger.load();
    expect(loaded.events.map((event) => event.runId)).toEqual(["before-the-crash", "after-the-crash"]);
    expect(loaded.tornLines).toHaveLength(1);
  },
  killTestTimeoutMs,
);

test(
  "a kill during a real write leaves a loadable Ledger wherever it lands",
  async () => {
    // Some filesystems cut the write on a kill and others finish it, so this can't demand
    // a torn line. It demands that the line is either whole or reported, and never damage.
    const workspace = await makeTempDir();
    const ledger = openHere(workspace);
    ledger.append({ type: "run.started", runId: "before-the-crash" });
    const path = join(workspace, "memory", "ledger.jsonl");
    const sizeBefore = statSync(path).size;

    const writer = spawnWriter(workspace, hermeticEnv(workspace), "giant-line", String(32 * 1024 * 1024));
    while (statSync(path).size === sizeBefore && writer.exitCode === null) {
      await Bun.sleep(0);
    }
    writer.kill("SIGKILL");
    await writer.exited;

    const loaded = ledger.load();
    expect(loaded.events[0]?.runId).toBe("before-the-crash");
    expect(loaded.events.length + loaded.tornLines.length).toBe(2);
    ledger.append({ type: "run.started", runId: "after-the-crash" });
    expect(ledger.load().events.at(-1)?.runId).toBe("after-the-crash");
  },
  killTestTimeoutMs,
);

test(
  "a pending from a killed process is listed as unfinished, and a new process can finish it",
  async () => {
    const workspace = await makeTempDir();
    const writer = spawnWriter(workspace, hermeticEnv(workspace), "pending-then-wait", "run-1");
    const actionId = await firstLine(writer);

    writer.kill("SIGKILL");
    await writer.exited;

    const ledger = openHere(workspace);
    expect(unfinishedActions(ledger.load().state).map((action) => action.actionId)).toEqual([actionId]);

    ledger.recordDone(actionId, "already-landed");
    expect(unfinishedActions(ledger.load().state)).toEqual([]);
  },
  killTestTimeoutMs,
);

test(
  "concurrent appends from separate processes leave every line intact",
  async () => {
    const workspace = await makeTempDir();
    const writers = 6;
    const linesEach = 40;
    // Larger than a page, so a write that wasn't one append would visibly interleave.
    const padBytes = 16 * 1024;

    const children = Array.from({ length: writers }, (_, index) =>
      spawnWriter(workspace, hermeticEnv(workspace), "append", `writer-${index}`, String(linesEach), String(padBytes)),
    );
    const exits = await Promise.all(children.map((child) => child.exited));
    expect(exits).toEqual(Array.from({ length: writers }, () => 0));

    const loaded = openHere(workspace).load();
    expect(loaded.tornLines).toEqual([]);
    expect(loaded.events).toHaveLength(writers * linesEach);
    expect(new Set(loaded.events.map((event) => event.eventId)).size).toBe(writers * linesEach);

    for (let index = 0; index < writers; index++) {
      const sequences = loaded.events
        .filter((event) => event.runId === `writer-${index}`)
        .map((event) => event.data?.sequence);
      expect(sequences).toEqual(Array.from({ length: linesEach }, (_, sequence) => sequence));
    }
  },
  killTestTimeoutMs,
);

test(
  "AC-55: with a sentinel HOME and USER, neither they nor the hostname reach the Ledger",
  async () => {
    const home = join(await makeTempDir(), "sentinel-home-value");
    const workspace = join(home, "workspaces", "sample");
    await mkdir(workspace, { recursive: true });
    const env = { ...hermeticEnv(home), USER: "sentinel-user-value", LOGNAME: "sentinel-user-value" };

    const recorded = await run(
      ["bun", writerScript, workspace, "record-path", join(workspace, "memory", "runs", "run-1")],
      { cwd: workspace, env },
    );
    expect(recorded.stderr).toBe("");
    expect(recorded.exitCode).toBe(0);

    const text = await readFile(join(workspace, "memory", "ledger.jsonl"), "utf8");
    expect(text).not.toContain("sentinel-home-value");
    expect(text).not.toContain("sentinel-user-value");
    expect(text).not.toContain(hostname());
    expect(text).not.toContain(home);
    expect(JSON.parse(text).data).toEqual({ path: "memory/runs/run-1" });
  },
  killTestTimeoutMs,
);

test.each([
  ["the sentinel HOME", (home: string) => join(home, "outside-the-workspace")],
  ["the sentinel USER", () => "sentinel-user-value"],
  ["the machine's hostname", () => hostname()],
])(
  "AC-55: a real process refuses to record %s",
  async (_name, value) => {
    const home = join(await makeTempDir(), "sentinel-home-value");
    const workspace = join(home, "workspaces", "sample");
    await mkdir(workspace, { recursive: true });
    const env = { ...hermeticEnv(home), USER: "sentinel-user-value" };

    const recorded = await run(["bun", writerScript, workspace, "record-path", value(home)], {
      cwd: workspace,
      env,
    });

    expect(recorded.exitCode).not.toBe(0);
    expect(recorded.stderr).toContain("data.path");
    expect(await Bun.file(join(workspace, "memory", "ledger.jsonl")).exists()).toBe(false);
  },
  killTestTimeoutMs,
);
