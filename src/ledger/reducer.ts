import {
  ACTION_DONE,
  ADAPTER_UNENFORCED_STARTED,
  ACTION_PENDING,
  APPROVAL_GRANTED,
  APPROVAL_REJECTED,
  APPROVAL_REQUESTED,
  RUN_LOCKED,
  TASK_CLOSED,
  TASK_LOCKED,
  type LedgerEvent,
} from "./events.ts";
import { LedgerCorruptError } from "./lines.ts";

export interface ActionRecord {
  actionId: string;
  state: "pending" | "done";
  runId: string;
  taskId?: string | null;
  kind: string;
  target: string;
  headSha: string;
  generation?: number;
  outcome?: string;
}

export type ApprovalDecision = "awaiting" | "approved" | "rejected";

export interface ApprovalRequestRecord {
  actionId: string;
  runId: string;
  taskId?: string | null;
  kind: string;
  target: string;
  headSha: string;
  diffSummary: string;
  decision: ApprovalDecision;
}

export interface TaskRecord {
  /** The highest generation the Ledger has seen for this Task's lock. */
  generation: number;
  /** The `eventId` of the event that closed the Task. */
  closedBy?: string;
}

/** State derived from the Ledger. `actions` keeps the order actions were last intended. */
export interface LedgerState {
  actions: ReadonlyMap<string, ActionRecord>;
  approvalRequests: ReadonlyMap<string, ApprovalRequestRecord>;
  tasks: ReadonlyMap<string, TaskRecord>;
  runGenerations: ReadonlyMap<string, number>;
  /** Per Adapter name, how many Workers it started without enforcing the Guard Policy. */
  unenforcedAdapterStarts: ReadonlyMap<string, number>;
}

export const initialState: LedgerState = {
  actions: new Map(),
  approvalRequests: new Map(),
  tasks: new Map(),
  runGenerations: new Map(),
  unenforcedAdapterStarts: new Map(),
};

export function reduce(state: LedgerState, event: LedgerEvent): LedgerState {
  if (event.type === ACTION_PENDING) return recordPending(state, event);
  if (event.type === ACTION_DONE) return recordDone(state, event);
  if (event.type === APPROVAL_REQUESTED) return recordRequest(state, event);
  if (event.type === APPROVAL_GRANTED) return recordDecision(state, event, "approved");
  if (event.type === APPROVAL_REJECTED) return recordDecision(state, event, "rejected");
  if (event.type === TASK_LOCKED) return recordTaskLocked(state, event);
  if (event.type === RUN_LOCKED) return recordRunLocked(state, event);
  if (event.type === TASK_CLOSED) return recordTaskClosed(state, event);
  if (event.type === ADAPTER_UNENFORCED_STARTED) return recordUnenforcedStart(state, event);
  return state;
}

export function replay(events: Iterable<LedgerEvent>): LedgerState {
  let state = initialState;
  for (const event of events) state = reduce(state, event);
  return state;
}

/** Actions with a `pending` and no `done`, for Reconciliation to resolve. */
export function unfinishedActions(state: LedgerState): ActionRecord[] {
  return [...state.actions.values()].filter((action) => action.state === "pending");
}

export function taskRecord(
  state: LedgerState,
  runId: string,
  taskId: string,
): TaskRecord | undefined {
  return state.tasks.get(taskKey(runId, taskId));
}

function taskKey(runId: string, taskId: string): string {
  return JSON.stringify([runId, taskId]);
}

function recordPending(state: LedgerState, event: LedgerEvent): LedgerState {
  const actionId = event.actionId as string;
  const actions = new Map(state.actions);
  actions.delete(actionId);
  actions.set(actionId, {
    actionId,
    state: "pending",
    runId: event.runId as string,
    taskId: event.taskId,
    kind: event.kind as string,
    target: event.target as string,
    headSha: event.headSha as string,
    generation: event.generation,
  });
  return { ...state, actions };
}

function recordDone(state: LedgerState, event: LedgerEvent): LedgerState {
  const actionId = event.actionId as string;
  const pending = state.actions.get(actionId);
  if (pending?.state !== "pending") {
    throw new LedgerCorruptError(
      `event ${event.eventId} records action ${actionId} as done with no pending before it`,
    );
  }
  const actions = new Map(state.actions);
  actions.set(actionId, { ...pending, state: "done", outcome: event.outcome });
  return { ...state, actions };
}

/** Recording a request again replaces it, so any earlier decision no longer stands. */
function recordRequest(state: LedgerState, event: LedgerEvent): LedgerState {
  const actionId = event.actionId as string;
  const approvalRequests = new Map(state.approvalRequests);
  approvalRequests.set(actionId, {
    actionId,
    runId: event.runId as string,
    taskId: event.taskId,
    kind: event.kind as string,
    target: event.target as string,
    headSha: event.headSha as string,
    diffSummary: event.data?.diffSummary as string,
    decision: "awaiting",
  });
  return { ...state, approvalRequests };
}

function recordDecision(
  state: LedgerState,
  event: LedgerEvent,
  decision: ApprovalDecision,
): LedgerState {
  const actionId = event.actionId as string;
  const request = state.approvalRequests.get(actionId);
  if (request === undefined) {
    throw new LedgerCorruptError(
      `event ${event.eventId} decides approval request ${actionId} with no request before it`,
    );
  }
  const approvalRequests = new Map(state.approvalRequests);
  approvalRequests.set(actionId, { ...request, decision });
  return { ...state, approvalRequests };
}

/** Takes the highest generation: a slow winner's event can land after its successor's. */
function recordTaskLocked(state: LedgerState, event: LedgerEvent): LedgerState {
  const key = taskKey(event.runId as string, event.taskId as string);
  const record = state.tasks.get(key);
  const generation = Math.max(record?.generation ?? 0, event.generation as number);
  const tasks = new Map(state.tasks);
  tasks.set(key, { ...record, generation });
  return { ...state, tasks };
}

function recordRunLocked(state: LedgerState, event: LedgerEvent): LedgerState {
  const runId = event.runId as string;
  const generation = Math.max(state.runGenerations.get(runId) ?? 0, event.generation as number);
  return { ...state, runGenerations: new Map(state.runGenerations).set(runId, generation) };
}

/**
 * Ledger order decides who was current. A close that lost that race can still reach the
 * file, because the check and the append aren't one step. It stays there, doing nothing.
 */
function recordTaskClosed(state: LedgerState, event: LedgerEvent): LedgerState {
  const key = taskKey(event.runId as string, event.taskId as string);
  const record = state.tasks.get(key);
  if (record === undefined || record.closedBy !== undefined) return state;
  if (event.generation !== record.generation) return state;
  const tasks = new Map(state.tasks);
  tasks.set(key, { ...record, closedBy: event.eventId });
  return { ...state, tasks };
}

function recordUnenforcedStart(state: LedgerState, event: LedgerEvent): LedgerState {
  const name = event.data?.adapter as string;
  const starts = new Map(state.unenforcedAdapterStarts);
  starts.set(name, (starts.get(name) ?? 0) + 1);
  return { ...state, unenforcedAdapterStarts: starts };
}
