import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { join, resolve } from "node:path";
import { RUN_LOCKED, TASK_LOCKED } from "../ledger/events.ts";
import { syncDirectory, type Ledger } from "../ledger/ledger.ts";
import { createScrub, type MachineIdentity } from "../ledger/privacy.ts";
import { taskRecord, type LedgerState } from "../ledger/reducer.ts";

export interface LocksOptions {
  workspace: string;
  clock: { now(): Date };
  identity: MachineIdentity;
  ledger: Ledger;
  /** How long a heartbeat stays live. The caller reads it from Policy. */
  ttlMs: number;
}

export interface HeldLock {
  /** Carried by this holder's Task-closing event, which is how a zombie gets refused. */
  readonly generation: number;
  /** Writes a fresh heartbeat. Throws `LockLostError` once another claimant has moved on. */
  renew(): void;
  /** Gives the lock up at once. Doing so after losing it changes nothing. */
  release(): void;
}

/**
 * `held` means a live heartbeat. `contended` means another claimant got there during this
 * claim. `closed` means the Ledger says the Task is finished, so there's nothing to hold.
 */
export type RefusalReason = "held" | "contended" | "closed";

export type Claim = { won: true; lock: HeldLock } | { won: false; reason: RefusalReason };

export interface Locks {
  claimTask(runId: string, taskId: string): Claim;
  claimRun(runId: string): Claim;
}

export class LockLostError extends Error {
  override readonly name = "LockLostError";

  constructor(generation: number) {
    super(`Locks: generation ${generation} of this lock has been lost to another holder`);
  }
}

/** Exactly what a lock file holds (ADR-0029). Times are numbers, so they can't match an identity. */
interface LockRecord {
  token: string;
  generation: number;
  heartbeatAt: number;
  ttlMs: number;
}

/** What a kind of lock needs from the Ledger. */
interface Subject {
  directory: string;
  ledgerView(state: LedgerState): { generation: number; closed: boolean };
  recordLocked(generation: number): void;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * A lock's file name carries its generation (`g7.lock`), and that's what makes takeover
 * safe. With one fixed path, a claimant that read a stale lock and then paused would
 * rename aside whatever is there by the time it wakes, including a rival's fresh lock.
 * Here, a late rename finds nothing, and a late renewal can only touch its own dead file.
 *
 * The holder is the `.lock` file of the highest generation in the directory, unless that
 * generation was already set aside. Set-aside files stay until a newer holder prunes them,
 * so the directory always shows the highest generation ever made, and a claimant that
 * creates a lower or finished generation sees that when it checks, and backs out.
 */
export function openLocks(options: LocksOptions): Locks {
  const { clock, ledger, ttlMs } = options;
  const root = join(resolve(options.workspace), "memory", "locks");
  const scrub = createScrub(resolve(options.workspace), options.identity);

  function claim(subject: Subject): Claim {
    const { directory } = subject;
    const view = subject.ledgerView(ledger.load().state);
    if (view.closed) return { won: false, reason: "closed" };

    fs.mkdirSync(directory, { recursive: true });
    const files = inspect(directory);

    if (files.holder !== null) {
      const path = lockPath(directory, files.holder);
      const status = heartbeatStatus(path, files.holder, clock.now().getTime(), ttlMs);
      if (status !== "expired") return { won: false, reason: status };
      // Only one rename of this file can succeed, so the other claimants stop here.
      if (!setAside(directory, files.holder)) return { won: false, reason: "contended" };
    }

    const generation = Math.max(view.generation, files.highest) + 1;
    const token = randomBytes(16).toString("hex");
    const path = lockPath(directory, generation);
    if (!createLock(path, { token, generation, heartbeatAt: clock.now().getTime(), ttlMs })) {
      return { won: false, reason: "contended" };
    }
    syncDirectory(directory);

    if (!holds(directory, generation, token)) {
      removeIfPresent(path);
      return { won: false, reason: "contended" };
    }

    try {
      subject.recordLocked(generation);
      const after = subject.ledgerView(ledger.load().state);
      if (after.closed || after.generation !== generation) {
        setAside(directory, generation);
        return { won: false, reason: after.closed ? "closed" : "contended" };
      }
    } catch (error) {
      setAside(directory, generation);
      throw error;
    }

    pruneBelow(directory, generation);
    return { won: true, lock: heldLock(directory, generation, token) };
  }

  function heldLock(directory: string, generation: number, token: string): HeldLock {
    const path = lockPath(directory, generation);
    return {
      generation,
      renew() {
        const heartbeat = { token, generation, heartbeatAt: clock.now().getTime(), ttlMs };
        const replaced = replaceLock(directory, path, heartbeat);
        // Checked after the rename, since a takeover can land just before it. If this holder
        // lost, that rename brought its dead file back, which no reader counts as live.
        if (!replaced || !holds(directory, generation, token)) {
          removeIfPresent(path);
          throw new LockLostError(generation);
        }
      },
      release() {
        setAside(directory, generation);
      },
    };
  }

  /** Refuses before anything reaches disk, so a bad ID leaves no directory behind. */
  function safeIds<Ids extends Record<string, string>>(ids: Ids): Ids {
    for (const [field, value] of Object.entries(ids)) {
      if (!SAFE_SEGMENT.test(value)) {
        throw new Error(`Locks: ${field} is not a safe path segment`);
      }
    }
    return scrub(ids);
  }

  return {
    claimTask(runId, taskId) {
      safeIds({ runId, taskId });
      return claim({
        directory: join(root, runId, "tasks", taskId),
        ledgerView: (state) => {
          const record = taskRecord(state, runId, taskId);
          return { generation: record?.generation ?? 0, closed: record?.closedBy !== undefined };
        },
        recordLocked: (generation) => {
          ledger.append({ type: TASK_LOCKED, runId, taskId, generation });
        },
      });
    },

    claimRun(runId) {
      safeIds({ runId });
      return claim({
        directory: join(root, runId, "run"),
        ledgerView: (state) => ({
          generation: state.runGenerations.get(runId) ?? 0,
          closed: false,
        }),
        recordLocked: (generation) => {
          ledger.append({ type: RUN_LOCKED, runId, generation });
        },
      });
    },
  };
}

const lockPath = (directory: string, generation: number) => join(directory, `g${generation}.lock`);

const FILE_NAME = /^g(\d+)\.(?:(lock)|[0-9a-f]+\.(aside|tmp))$/;

interface Inspection {
  /** The highest generation ever made here, from `.lock` and `.aside` files alike. */
  highest: number;
  /** The generation whose `.lock` file is the live one, if any is. */
  holder: number | null;
  setAside: Set<number>;
}

function inspect(directory: string): Inspection {
  const locks = new Set<number>();
  const asides = new Set<number>();
  for (const name of listDirectory(directory)) {
    const match = FILE_NAME.exec(name);
    if (match === null) continue;
    const generation = Number(match[1]);
    if (match[2] === "lock") locks.add(generation);
    else if (match[3] === "aside") asides.add(generation);
  }
  const highest = Math.max(0, ...locks, ...asides);
  const holder = locks.has(highest) && !asides.has(highest) ? highest : null;
  return { highest, holder, setAside: asides };
}

function holds(directory: string, generation: number, token: string): boolean {
  if (inspect(directory).holder !== generation) return false;
  return readRecord(lockPath(directory, generation), generation)?.token === token;
}

/**
 * A lock file can have no readable heartbeat, when its creator is between its `O_EXCL`
 * create and its write, or died there. Those look the same, so the file's age stands in
 * for the heartbeat: otherwise a kill in that instant would hold the Task forever.
 */
function heartbeatStatus(
  path: string,
  generation: number,
  now: number,
  ttlMs: number,
): "held" | "contended" | "expired" {
  const record = readRecord(path, generation);
  if (record !== null) return now >= record.heartbeatAt + record.ttlMs ? "expired" : "held";
  const age = fileModifiedAt(path);
  return age !== null && now >= age + ttlMs ? "expired" : "contended";
}

function readRecord(path: string, generation: number): LockRecord | null {
  try {
    const record = JSON.parse(fs.readFileSync(path, "utf8")) as Partial<LockRecord> | null;
    const wellFormed =
      typeof record?.token === "string" &&
      record.generation === generation &&
      Number.isFinite(record.heartbeatAt) &&
      Number.isFinite(record.ttlMs);
    return wellFormed ? (record as LockRecord) : null;
  } catch {
    return null;
  }
}

function fileModifiedAt(path: string): number | null {
  try {
    return fs.statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** The ADR-0029 create: `O_EXCL`, so only one claimant of this generation gets the file. */
function createLock(path: string, record: LockRecord): boolean {
  const { O_WRONLY, O_CREAT, O_EXCL } = fs.constants;
  let fd: number;
  try {
    fd = fs.openSync(path, O_WRONLY | O_CREAT | O_EXCL, 0o600);
  } catch (error) {
    if (hasCode(error, "EEXIST")) return false;
    throw error;
  }
  try {
    writeRecord(fd, record);
  } catch (error) {
    removeIfPresent(path);
    throw error;
  }
  return true;
}

/**
 * Write-to-temp, fsync and atomic rename, so a crash leaves the old heartbeat or the new.
 * Returns false if the temp file vanished, which means a newer holder pruned it.
 */
function replaceLock(directory: string, path: string, record: LockRecord): boolean {
  const temp = join(directory, `g${record.generation}.${randomBytes(8).toString("hex")}.tmp`);
  const { O_WRONLY, O_CREAT, O_EXCL } = fs.constants;
  try {
    writeRecord(fs.openSync(temp, O_WRONLY | O_CREAT | O_EXCL, 0o600), record);
    fs.renameSync(temp, path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    removeIfPresent(temp);
    throw error;
  }
  syncDirectory(directory);
  return true;
}

/** Writes the whole record to an open file, fsyncs it and closes it. */
function writeRecord(fd: number, record: LockRecord): void {
  try {
    const bytes = Buffer.from(JSON.stringify(record));
    const written = fs.writeSync(fd, bytes);
    if (written !== bytes.length) {
      throw new Error(`Locks: short write, ${written} of ${bytes.length} bytes reached the file`);
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Returns false if the file was already gone, meaning someone else set it aside first. */
function setAside(directory: string, generation: number): boolean {
  const aside = join(directory, `g${generation}.${randomBytes(8).toString("hex")}.aside`);
  try {
    fs.renameSync(lockPath(directory, generation), aside);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
  syncDirectory(directory);
  return true;
}

/** Only a winner calls this. Nothing below its generation can matter again. */
function pruneBelow(directory: string, generation: number): void {
  for (const name of listDirectory(directory)) {
    const match = FILE_NAME.exec(name);
    if (match !== null && Number(match[1]) < generation) removeIfPresent(join(directory, name));
  }
}

function listDirectory(directory: string): string[] {
  try {
    return fs.readdirSync(directory);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return [];
    throw error;
  }
}

function removeIfPresent(path: string): void {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
