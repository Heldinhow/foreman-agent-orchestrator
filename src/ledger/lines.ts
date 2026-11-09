import { ACTION_DONE, ACTION_PENDING, SCHEMA_VERSION, type LedgerEvent } from "./events.ts";

/** Where a crashed append left bytes that aren't an event. The bytes stay in the file. */
export interface TornLine {
  line: number;
  byteOffset: number;
  byteLength: number;
}

export interface ParsedLedger {
  events: LedgerEvent[];
  tornLines: TornLine[];
}

export class LedgerCorruptError extends Error {
  override readonly name = "LedgerCorruptError";
  readonly line: number | undefined;

  constructor(reason: string, location?: { line: number; byteOffset: number }) {
    const where = location ? ` at line ${location.line} (byte ${location.byteOffset})` : "";
    super(
      `Ledger memory/ledger.jsonl can't be trusted${where}: ${reason}. ` +
        "Foreman stopped rather than act on a damaged record; restore the file or repair it by hand.",
    );
    this.line = location?.line;
  }
}

const NEWLINE = 0x0a;
/** Every line opens with these bytes, because the writer puts `schemaVersion` first. */
const LINE_OPENING = Buffer.from('{"schemaVersion":');
const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Reads the Ledger's bytes. A crash can only cut an append short, so damage from a
 * crash has two forms: an unterminated final line, and that same fragment with a later
 * process's complete line written straight after it. Anything else is corruption.
 */
export function parseLedger(bytes: Buffer): ParsedLedger {
  const events: LedgerEvent[] = [];
  const tornLines: TornLine[] = [];
  const eventIds = new Set<string>();

  let offset = 0;
  for (let line = 1; offset < bytes.length; line++) {
    const end = bytes.indexOf(NEWLINE, offset);
    if (end === -1) {
      tornLines.push({ line, byteOffset: offset, byteLength: bytes.length - offset });
      break;
    }

    const { event, fragmentLength } = parseLine(bytes.subarray(offset, end), line, offset);
    if (fragmentLength > 0) {
      tornLines.push({ line, byteOffset: offset, byteLength: fragmentLength });
    }
    if (eventIds.has(event.eventId)) {
      throw new LedgerCorruptError(`eventId ${event.eventId} is repeated`, {
        line,
        byteOffset: offset,
      });
    }
    eventIds.add(event.eventId);
    events.push(event);
    offset = end + 1;
  }

  return { events, tornLines };
}

function parseLine(bytes: Buffer, line: number, offset: number) {
  const whole = readEvent(bytes);
  if (typeof whole !== "string") return { event: whole, fragmentLength: 0 };

  for (
    let start = bytes.indexOf(LINE_OPENING, 1);
    start !== -1;
    start = bytes.indexOf(LINE_OPENING, start + 1)
  ) {
    if (!opensLikeALine(bytes.subarray(0, start))) break;
    const event = readEvent(bytes.subarray(start));
    if (typeof event !== "string") return { event, fragmentLength: start };
  }

  throw new LedgerCorruptError(whole, { line, byteOffset: offset });
}

/** A torn fragment is a prefix of what the writer writes, however short. */
function opensLikeALine(fragment: Buffer): boolean {
  const length = Math.min(fragment.length, LINE_OPENING.length);
  return fragment.subarray(0, length).equals(LINE_OPENING.subarray(0, length));
}

/** Returns the event, or the reason these bytes aren't one. */
function readEvent(bytes: Buffer): LedgerEvent | string {
  let value: unknown;
  try {
    value = JSON.parse(utf8.decode(bytes));
  } catch {
    return "the line isn't valid JSON";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "the line isn't a JSON object";
  }

  const fields = value as Record<string, unknown>;
  const reason = eventProblem(fields);
  return reason ?? (fields as unknown as LedgerEvent);
}

function eventProblem(fields: Record<string, unknown>): string | undefined {
  const version = fields.schemaVersion;
  if (typeof version === "number" && version > SCHEMA_VERSION) {
    return `schemaVersion ${version} is newer than this Foreman supports (${SCHEMA_VERSION})`;
  }
  if (version !== SCHEMA_VERSION) return "schemaVersion is missing or invalid";

  const required = ["eventId", "at", "type"];
  if (fields.type === ACTION_PENDING) {
    required.push("actionId", "runId", "kind", "target", "headSha");
    if (fields.state !== "pending") return `${ACTION_PENDING} must have state "pending"`;
  }
  if (fields.type === ACTION_DONE) {
    required.push("actionId", "outcome");
    if (fields.state !== "done") return `${ACTION_DONE} must have state "done"`;
  }
  for (const name of required) {
    const field = fields[name];
    if (typeof field !== "string" || field === "") return `${name} is missing or empty`;
  }
  return undefined;
}
