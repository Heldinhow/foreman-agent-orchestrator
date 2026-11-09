import { afterEach, expect, mock, spyOn, test } from "bun:test";
import fs from "node:fs";
import { openLedger, StaleGenerationError } from "../../src/ledger/ledger.ts";
import { replay, taskRecord } from "../../src/ledger/reducer.ts";
import type { LedgerEvent } from "../../src/ledger/events.ts";
import { openLocks, type Claim } from "../../src/locks/locks.ts";
import { fakeIdentity } from "../helpers/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";

afterEach(() => {
  mock.restore();
});

const TTL_MS = 120_000;
const START = Date.parse("2026-01-02T03:04:05.000Z");

async function newLocks() {
  const workspace = await makeTempDir();
  let time = START;
  const clock = { now: () => new Date(time), set: (at: number) => void (time = at) };
  const ledger = openLedger({ workspace, clock, identity: fakeIdentity });
  const locks = openLocks({ workspace, clock, identity: fakeIdentity, ledger, ttlMs: TTL_MS });
  return { workspace, clock, ledger, locks };
}

function generationOf(claim: Claim): number {
  if (!claim.won) throw new Error(`expected to win, got ${JSON.stringify(claim)}`);
  return claim.lock.generation;
}

const closeEvent = (generation: number | undefined) => ({
  type: "task.closed",
  runId: "run-1",
  taskId: "task-1",
  generation,
});

const closeEvents = (ledger: ReturnType<typeof openLedger>) =>
  ledger.load().events.filter((event) => event.type === "task.closed");

test("AC-20: the current holder's Task-closing event is accepted", async () => {
  const { ledger, locks } = await newLocks();
  const generation = generationOf(locks.claimTask("run-1", "task-1"));

  const closed = ledger.append(closeEvent(generation));

  expect(taskRecord(ledger.load().state, "run-1", "task-1")?.closedBy).toBe(closed.eventId);
});

test("AC-20: a lost holder's Task-closing event with an old generation is refused", async () => {
  const { clock, ledger, locks } = await newLocks();
  const zombie = generationOf(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);
  const holder = generationOf(locks.claimTask("run-1", "task-1"));

  expect(() => ledger.append(closeEvent(zombie))).toThrow(StaleGenerationError);

  expect(closeEvents(ledger)).toEqual([]);
  expect(taskRecord(ledger.load().state, "run-1", "task-1")?.closedBy).toBeUndefined();
  const closed = ledger.append(closeEvent(holder));
  expect(taskRecord(ledger.load().state, "run-1", "task-1")?.closedBy).toBe(closed.eventId);
});

test("AC-20: a close that loses the race to a takeover is refused and has no effect", async () => {
  const { workspace, clock, ledger, locks } = await newLocks();
  const zombie = generationOf(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);

  // The zombie has passed its check. Before its write, the takeover reaches the Ledger.
  const openSync = fs.openSync;
  const spy = spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
    if (String(args[0]).endsWith("ledger.jsonl")) {
      spy.mockRestore();
      locks.claimTask("run-1", "task-1");
    }
    return openSync(...args);
  }) as typeof fs.openSync);

  expect(() => ledger.append(closeEvent(zombie))).toThrow(StaleGenerationError);

  const reopened = openLedger({ workspace, clock, identity: fakeIdentity });
  expect(closeEvents(reopened)).toHaveLength(1);
  expect(taskRecord(reopened.load().state, "run-1", "task-1")).toEqual({ generation: 2 });
});

test.each([
  ["no generation", undefined],
  ["a future generation", 2],
])("a Task-closing event with %s is refused", async (_name, generation) => {
  const { ledger, locks } = await newLocks();
  locks.claimTask("run-1", "task-1");

  expect(() => ledger.append(closeEvent(generation))).toThrow(StaleGenerationError);

  expect(closeEvents(ledger)).toEqual([]);
});

test("a Task nobody ever locked can't be closed", async () => {
  const { ledger } = await newLocks();

  expect(() => ledger.append(closeEvent(1))).toThrow(StaleGenerationError);
});

test("a closed Task can't be closed again", async () => {
  const { ledger, locks } = await newLocks();
  const generation = generationOf(locks.claimTask("run-1", "task-1"));
  ledger.append(closeEvent(generation));

  expect(() => ledger.append(closeEvent(generation))).toThrow(StaleGenerationError);

  expect(closeEvents(ledger)).toHaveLength(1);
});

test("a closed Task can't be claimed, even once its lock has expired", async () => {
  const { clock, ledger, locks } = await newLocks();
  const generation = generationOf(locks.claimTask("run-1", "task-1"));
  ledger.append(closeEvent(generation));
  clock.set(START + TTL_MS);

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "closed" });
});

test("a claim that finds the Task closed once its lock is recorded gives the lock back", async () => {
  const { clock, ledger, locks } = await newLocks();
  const generation = generationOf(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);

  // The old holder closes in the gap between the claimant's check and its Ledger write.
  const append = ledger.append;
  const spy = spyOn(ledger, "append").mockImplementation((event) => {
    spy.mockRestore();
    append(closeEvent(generation));
    return append(event);
  });

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "closed" });
});

const event = (type: string, fields: Partial<LedgerEvent>, eventId: string): LedgerEvent => ({
  schemaVersion: 1,
  eventId,
  at: "2026-01-02T03:04:05.000Z",
  type,
  runId: "run-1",
  taskId: "task-1",
  ...fields,
});

test("replaying the Ledger ignores a stale Task-closing event", () => {
  const state = replay([
    event("task.locked", { generation: 1 }, "e1"),
    event("task.locked", { generation: 2 }, "e2"),
    event("task.closed", { generation: 1 }, "e3"),
  ]);

  expect(taskRecord(state, "run-1", "task-1")).toEqual({ generation: 2 });
});

test("replaying keeps the highest generation when a slow winner's event lands late", () => {
  const state = replay([
    event("task.locked", { generation: 3 }, "e1"),
    event("task.locked", { generation: 2 }, "e2"),
    event("task.closed", { generation: 2 }, "e3"),
  ]);

  expect(taskRecord(state, "run-1", "task-1")).toEqual({ generation: 3 });
});

test("replaying records the close from the current generation, and keeps it", () => {
  const state = replay([
    event("task.locked", { generation: 1 }, "e1"),
    event("task.closed", { generation: 1 }, "e2"),
    event("task.locked", { generation: 2 }, "e3"),
    event("task.closed", { generation: 2 }, "e4"),
  ]);

  expect(taskRecord(state, "run-1", "task-1")).toEqual({ generation: 2, closedBy: "e2" });
});

test("replaying keeps Tasks of different Runs apart", () => {
  const state = replay([
    event("task.locked", { generation: 4 }, "e1"),
    event("task.locked", { runId: "run-2", generation: 1 }, "e2"),
  ]);

  expect(taskRecord(state, "run-1", "task-1")?.generation).toBe(4);
  expect(taskRecord(state, "run-2", "task-1")?.generation).toBe(1);
});
