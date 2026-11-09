import { expect, test } from "bun:test";
import { deriveActionId } from "../../src/ledger/action-id.ts";
import type { LedgerEvent } from "../../src/ledger/events.ts";
import { LedgerCorruptError } from "../../src/ledger/lines.ts";
import { initialState, reduce, replay, unfinishedActions } from "../../src/ledger/reducer.ts";

const headSha = "0123456789abcdef0123456789abcdef01234567";
const action = {
  runId: "run-1",
  taskId: "task-1",
  kind: "push",
  target: "refs/heads/foreman/run-1",
  headSha,
};

test("actionId is deterministic from Run, Task, kind, target and head SHA", () => {
  expect(deriveActionId(action)).toBe("9b63475f7f096f73069620155375467d");
});

test("an action with no Task has its own stable actionId", () => {
  const runLevel = { runId: "run-1", taskId: null, kind: "deploy", target: "production", headSha };

  expect(deriveActionId(runLevel)).toBe("be19201e4edd2b831474d4de5217f3f3");
});

test.each([
  ["Run", { runId: "run-2" }],
  ["Task", { taskId: "task-2" }],
  ["kind", { kind: "open-pr" }],
  ["target", { target: "refs/heads/other" }],
  ["head SHA", { headSha: "fedcba9876543210fedcba9876543210fedcba98" }],
])("actionId changes with the %s", (_name, change) => {
  expect(deriveActionId({ ...action, ...change })).not.toBe(deriveActionId(action));
});

test("values can't run together to imitate another action", () => {
  const one = { ...action, runId: "a", taskId: "b-c" };
  const other = { ...action, runId: "a-b", taskId: "c" };

  expect(deriveActionId(one)).not.toBe(deriveActionId(other));
});

let nextId = 0;
const base = () => ({
  schemaVersion: 1,
  eventId: `event-${nextId++}`,
  at: "2026-01-02T03:04:05.000Z",
});

function pending(actionId: string, generation = 1): LedgerEvent {
  return {
    ...base(),
    type: "action.pending",
    state: "pending",
    actionId,
    runId: "run-1",
    taskId: "task-1",
    kind: "push",
    target: "refs/heads/foreman/run-1",
    headSha,
    generation,
  };
}

function done(actionId: string, outcome = "pushed"): LedgerEvent {
  return { ...base(), type: "action.done", state: "done", actionId, runId: "run-1", outcome };
}

const unfinishedIds = (events: LedgerEvent[]) =>
  unfinishedActions(replay(events)).map((unfinished) => unfinished.actionId);

test("pending without done is listed as unfinished", () => {
  expect(unfinishedIds([pending("a")])).toEqual(["a"]);
});

test("pending then done is not listed", () => {
  expect(unfinishedIds([pending("a"), done("a")])).toEqual([]);
});

test("an unfinished action keeps what Reconciliation needs", () => {
  expect(unfinishedActions(replay([pending("a", 3)]))).toEqual([
    {
      actionId: "a",
      state: "pending",
      runId: "run-1",
      taskId: "task-1",
      kind: "push",
      target: "refs/heads/foreman/run-1",
      headSha,
      generation: 3,
    },
  ]);
});

test("a finished action keeps its outcome in the state", () => {
  const state = replay([pending("a"), done("a", "already-landed")]);

  expect(state.actions.get("a")).toMatchObject({ state: "done", outcome: "already-landed" });
});

test("unfinished actions are listed in the order they were intended", () => {
  expect(unfinishedIds([pending("a"), pending("b"), pending("c"), done("b")])).toEqual(["a", "c"]);
});

test("a repeated pending for the same action is one unfinished action", () => {
  expect(unfinishedIds([pending("a"), pending("a")])).toEqual(["a"]);
});

test("a new attempt after done is unfinished again", () => {
  expect(unfinishedIds([pending("a"), done("a"), pending("a")])).toEqual(["a"]);
});

test("done with no pending before it is corruption", () => {
  expect(() => replay([done("a")])).toThrow(LedgerCorruptError);
});

test("a second done with no new pending is corruption", () => {
  expect(() => replay([pending("a"), done("a"), done("a")])).toThrow(LedgerCorruptError);
});

test("events the reducer doesn't know are ignored", () => {
  const other: LedgerEvent = { ...base(), type: "run.started", runId: "run-1" };

  expect(replay([other])).toEqual(initialState);
});

test("the reducer is pure: it changes neither its input state nor the event", () => {
  const event = Object.freeze(pending("a"));
  const before = replay([pending("b")]);
  const snapshot = new Map(before.actions);

  const after = reduce(before, event);

  expect(before.actions).toEqual(snapshot);
  expect(after).not.toBe(before);
  expect(reduce(before, event)).toEqual(after);
});
