import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { deriveActionId, type ActionIdentity } from "./action-id.ts";
import {
  ACTION_DONE,
  ACTION_PENDING,
  SCHEMA_VERSION,
  TASK_CLOSED,
  type LedgerEvent,
} from "./events.ts";
import { parseLedger, type TornLine } from "./lines.ts";
import { createScrub, type MachineIdentity } from "./privacy.ts";
import { replay, taskRecord, type LedgerState } from "./reducer.ts";

export { LedgerCorruptError, type TornLine } from "./lines.ts";
export { LedgerPrivacyError } from "./privacy.ts";

export class StaleGenerationError extends Error {
  override readonly name = "StaleGenerationError";

  /** Holds only the Ledger's own IDs and numbers, so this message may be shown or logged. */
  constructor(runId: unknown, taskId: unknown, generation: unknown) {
    super(`Ledger: refusing to close Task ${taskId} of Run ${runId}: generation ${generation} isn't current`);
  }
}

export interface LedgerOptions {
  workspace: string;
  clock: { now(): Date };
  identity: MachineIdentity;
}

export type NewEvent = Omit<LedgerEvent, "schemaVersion" | "eventId" | "at">;

export interface NewAction extends ActionIdentity {
  generation?: number;
  data?: Record<string, unknown>;
}

export type ActionEvent = LedgerEvent & { actionId: string };

export interface LoadedLedger {
  events: LedgerEvent[];
  tornLines: TornLine[];
  state: LedgerState;
}

export interface Ledger {
  /**
   * Durably records one event. Actions go through `recordPending` and `recordDone`. A
   * Task-closing event without the current generation throws `StaleGenerationError`.
   */
  append(event: NewEvent): LedgerEvent;
  /** Durably records an intended action. Returning means it's safe to perform it. */
  recordPending(action: NewAction): ActionEvent;
  /** Durably records an action's outcome. Refused unless the Ledger holds its `pending`. */
  recordDone(actionId: string, outcome: string, data?: Record<string, unknown>): ActionEvent;
  /**
   * Reads the whole Ledger and replays it. With other processes appending, a line
   * still being written can show up in `tornLines` until its write finishes.
   */
  load(): LoadedLedger;
}

export function openLedger(options: LedgerOptions): Ledger {
  const workspace = resolve(options.workspace);
  const path = join(workspace, "memory", "ledger.jsonl");
  const scrub = createScrub(workspace, options.identity);

  function write<Event extends NewEvent>(event: Event): LedgerEvent & Event {
    const line = {
      schemaVersion: SCHEMA_VERSION,
      eventId: randomUUID(),
      at: options.clock.now().toISOString(),
      ...scrub(event),
    };
    appendLine(path, `${JSON.stringify(line)}\n`);
    return line;
  }

  function load(): LoadedLedger {
    if (!fs.existsSync(path)) return { ...parseLedger(Buffer.alloc(0)), state: replay([]) };
    const parsed = parseLedger(fs.readFileSync(path));
    return { ...parsed, state: replay(parsed.events) };
  }

  function closeTask(event: NewEvent): LedgerEvent {
    const { runId, taskId, generation } = event;
    const stale = () => new StaleGenerationError(runId, taskId, generation);
    const current = taskRecord(load().state, String(runId), String(taskId));
    if (current?.generation !== generation || current?.closedBy !== undefined) throw stale();

    const line = write(event);
    // A takeover can land between that check and this write, and Ledger order decides.
    const after = taskRecord(load().state, String(runId), String(taskId));
    if (after?.closedBy !== line.eventId) throw stale();
    return line;
  }

  return {
    append(event) {
      if (event.type.startsWith("action.")) {
        throw new Error(`Ledger: "${event.type}" is written only by recordPending and recordDone`);
      }
      return event.type === TASK_CLOSED ? closeTask(event) : write(event);
    },

    recordPending(action) {
      // Scrubbed first, so the ID comes from the target as stored.
      const clean = scrub(action);
      const { runId, taskId, kind, target, headSha, generation, data } = clean;
      return write({
        type: ACTION_PENDING,
        state: "pending",
        actionId: deriveActionId(clean),
        runId,
        taskId,
        kind,
        target,
        headSha,
        generation,
        data,
      });
    },

    recordDone(actionId, outcome, data) {
      const pending = load().state.actions.get(actionId);
      if (pending?.state !== "pending") {
        throw new Error(`Ledger: action ${actionId} has no pending to finish`);
      }
      const { runId, taskId, kind, target, headSha, generation } = pending;
      return write({
        type: ACTION_DONE,
        state: "done",
        outcome,
        actionId,
        runId,
        taskId,
        kind,
        target,
        headSha,
        generation,
        data,
      });
    },

    load,
  };
}

/**
 * One line is exactly one `O_APPEND` write and then an fsync (ADR-0030), so concurrent
 * appenders can't interleave. A short write is never topped up, because a second write
 * could land after another process's line. It leaves a fragment that `parseLedger`
 * reports as torn, and the caller sees a failure, so nothing acts on the event.
 */
function appendLine(path: string, line: string): void {
  const directory = dirname(path);
  fs.mkdirSync(directory, { recursive: true });
  const { O_WRONLY, O_APPEND, O_CREAT } = fs.constants;
  const bytes = Buffer.from(line);

  const fd = fs.openSync(path, O_WRONLY | O_APPEND | O_CREAT, 0o600);
  try {
    const isFirstLine = fs.fstatSync(fd).size === 0;
    const written = fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
    if (written !== bytes.length) {
      throw new Error(`Ledger: short write, ${written} of ${bytes.length} bytes reached the file`);
    }
    if (isFirstLine) {
      // A new file is only durable once the directories naming it are.
      syncDirectory(directory);
      syncDirectory(dirname(directory));
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function syncDirectory(path: string): void {
  const fd = fs.openSync(path, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
