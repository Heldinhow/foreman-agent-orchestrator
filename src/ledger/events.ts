export const SCHEMA_VERSION = 1;

/** One line of the Ledger. Event types beyond the action pair belong to later modules. */
export interface LedgerEvent {
  schemaVersion: number;
  eventId: string;
  at: string;
  type: string;
  runId?: string;
  taskId?: string | null;
  actionId?: string;
  kind?: string;
  target?: string;
  headSha?: string;
  generation?: number;
  state?: "pending" | "done";
  outcome?: string;
  data?: Record<string, unknown>;
}

export const ACTION_PENDING = "action.pending";
export const ACTION_DONE = "action.done";

/** Written when a claimant wins a lock. `generation` numbers each holder in turn. */
export const TASK_LOCKED = "task.locked";
export const RUN_LOCKED = "run.locked";
/** Must carry the current generation, so a holder that lost its lock can't close the Task. */
export const TASK_CLOSED = "task.closed";
