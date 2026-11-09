import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openLedger } from "../../src/ledger/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { fixedClock, fakeIdentity } from "../helpers/ledger.ts";

async function newLedger() {
  const workspace = await makeTempDir();
  const ledger = openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });
  const path = join(workspace, "memory", "ledger.jsonl");
  return { workspace, ledger, path };
}

test("AC-50: every line has schemaVersion and a unique eventId", async () => {
  const { ledger, path } = await newLedger();

  ledger.append({ type: "run.started", runId: "run-1" });
  ledger.append({ type: "run.started", runId: "run-2" });

  const lines = (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
  expect(lines.map((line) => line.schemaVersion)).toEqual([1, 1]);
  expect(lines[0].eventId).toBeString();
  expect(lines[0].eventId).not.toBe(lines[1].eventId);
});

test("a line holds the time from the clock and the event's own fields", async () => {
  const { ledger, path } = await newLedger();

  ledger.append({ type: "run.started", runId: "run-1", data: { intentHash: "abc" } });

  const [line] = (await readFile(path, "utf8")).trimEnd().split("\n").map((text) => JSON.parse(text));
  expect(line).toMatchObject({
    at: "2026-01-02T03:04:05.000Z",
    type: "run.started",
    runId: "run-1",
    data: { intentHash: "abc" },
  });
});

test("AC-50: existing lines are never altered by a later append", async () => {
  const { ledger, path } = await newLedger();

  ledger.append({ type: "run.started", runId: "run-1" });
  const before = await readFile(path);
  ledger.append({ type: "run.started", runId: "run-2" });
  const after = await readFile(path);

  expect(after.length).toBeGreaterThan(before.length);
  expect(after.subarray(0, before.length).equals(before)).toBe(true);
});

test("appended events come back from load in order", async () => {
  const { ledger } = await newLedger();

  ledger.append({ type: "run.started", runId: "run-1" });
  ledger.append({ type: "run.started", runId: "run-2" });

  expect(ledger.load().events.map((event) => event.runId)).toEqual(["run-1", "run-2"]);
});

test("a Workspace with no Ledger yet loads as empty and is not created by loading", async () => {
  const { ledger, path } = await newLedger();

  const loaded = ledger.load();

  expect(loaded.events).toEqual([]);
  expect(loaded.tornLines).toEqual([]);
  expect(await Bun.file(path).exists()).toBe(false);
});

test("action events can't be appended directly, so a done can't skip its pending", async () => {
  const { ledger } = await newLedger();

  expect(() => ledger.append({ type: "action.done", runId: "run-1" })).toThrow(/recordPending|recordDone/);
  expect(ledger.load().events).toEqual([]);
});
