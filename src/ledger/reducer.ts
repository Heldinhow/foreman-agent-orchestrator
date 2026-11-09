import { ACTION_DONE, ACTION_PENDING, type LedgerEvent } from "./events.ts";
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

/** State derived from the Ledger. `actions` keeps the order actions were last intended. */
export interface LedgerState {
  actions: ReadonlyMap<string, ActionRecord>;
}

export const initialState: LedgerState = { actions: new Map() };

export function reduce(state: LedgerState, event: LedgerEvent): LedgerState {
  if (event.type === ACTION_PENDING) return recordPending(state, event);
  if (event.type === ACTION_DONE) return recordDone(state, event);
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
  return { actions };
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
  return { actions };
}
