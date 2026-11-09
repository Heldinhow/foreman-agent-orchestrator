import { afterEach, expect, mock, spyOn, test } from "bun:test";
import fs from "node:fs";
import { join } from "node:path";
import { openLedger } from "../../src/ledger/ledger.ts";
import { LockLostError, openLocks } from "../../src/locks/locks.ts";
import { fakeIdentity } from "../helpers/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";

afterEach(() => {
  mock.restore();
});

const TTL_MS = 120_000;
const START = Date.parse("2026-01-02T03:04:05.000Z");

function movableClock() {
  let time = START;
  return { now: () => new Date(time), set: (at: number) => void (time = at) };
}

async function newLocks() {
  const workspace = await makeTempDir();
  const clock = movableClock();
  const ledger = openLedger({ workspace, clock, identity: fakeIdentity });
  const locks = openLocks({ workspace, clock, identity: fakeIdentity, ledger, ttlMs: TTL_MS });
  const taskDir = join(workspace, "memory", "locks", "run-1", "tasks", "task-1");
  return { workspace, clock, ledger, locks, taskDir };
}

function won<Claim extends { won: boolean }>(claim: Claim) {
  if (!claim.won) throw new Error(`expected to win, got ${JSON.stringify(claim)}`);
  return claim as Extract<Claim, { won: true }>;
}

test("AC-17: the first claimant holds the Task at generation 1 and the next is refused", async () => {
  const { locks, ledger } = await newLocks();

  const first = locks.claimTask("run-1", "task-1");
  const second = locks.claimTask("run-1", "task-1");

  expect(won(first).lock.generation).toBe(1);
  expect(second).toEqual({ won: false, reason: "held" });
  const locked = ledger.load().events.filter((event) => event.type === "task.locked");
  expect(locked).toHaveLength(1);
  expect(locked[0]).toMatchObject({ runId: "run-1", taskId: "task-1", generation: 1 });
});

test("a Task Lock doesn't stop a claim on another Task or on the Run", async () => {
  const { locks } = await newLocks();

  locks.claimTask("run-1", "task-1");

  expect(locks.claimTask("run-1", "task-2").won).toBe(true);
  expect(locks.claimTask("run-2", "task-1").won).toBe(true);
  expect(locks.claimRun("run-1").won).toBe(true);
});

test("AC-19: a live heartbeat can't be taken over, up to the last millisecond of its TTL", async () => {
  const { locks, clock } = await newLocks();
  locks.claimTask("run-1", "task-1");

  clock.set(START + TTL_MS - 1);

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
});

test("AC-18: a heartbeat expired at its TTL can be taken over, at the next generation", async () => {
  const { locks, clock, ledger } = await newLocks();
  locks.claimTask("run-1", "task-1");

  clock.set(START + TTL_MS);

  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
  const generations = ledger.load().events.filter((event) => event.type === "task.locked");
  expect(generations.map((event) => event.generation)).toEqual([1, 2]);
});

test("a renewal pushes expiry a full TTL past the renewal", async () => {
  const { locks, clock } = await newLocks();
  const { lock } = won(locks.claimTask("run-1", "task-1"));
  const renewedAt = START + TTL_MS - 1;

  clock.set(renewedAt);
  lock.renew();

  clock.set(renewedAt + TTL_MS - 1);
  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
  clock.set(renewedAt + TTL_MS);
  expect(locks.claimTask("run-1", "task-1").won).toBe(true);
});

test("an expired holder nobody took over from can renew and keep its generation", async () => {
  const { locks, clock } = await newLocks();
  const { lock } = won(locks.claimTask("run-1", "task-1"));

  clock.set(START + TTL_MS * 2);
  lock.renew();

  expect(lock.generation).toBe(1);
  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
});

test("a holder that lost its lock can't renew, and trying leaves the new holder in place", async () => {
  const { locks, clock } = await newLocks();
  const { lock: zombie } = won(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);
  const { lock: holder } = won(locks.claimTask("run-1", "task-1"));

  expect(() => zombie.renew()).toThrow(LockLostError);

  holder.renew();
  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
});

test("a renewal that brings back its dead file reports the loss and removes it", async () => {
  const { locks, clock, taskDir } = await newLocks();
  const { lock: zombie } = won(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);
  const tempCopy = join(taskDir, "held-back");

  // The takeover lands just before the renewal's rename, and misses its temp file.
  const renameSync = fs.renameSync;
  const spy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
    spy.mockRestore();
    renameSync(from, tempCopy);
    locks.claimTask("run-1", "task-1");
    renameSync(tempCopy, to);
  });

  expect(() => zombie.renew()).toThrow(LockLostError);

  expect(fs.readdirSync(taskDir)).toEqual(["g2.lock"]);
  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
});

test("a renewal whose temp file a new holder pruned reports the loss", async () => {
  const { locks, clock, taskDir } = await newLocks();
  const { lock: zombie } = won(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);

  const renameSync = fs.renameSync;
  const spy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
    spy.mockRestore();
    locks.claimTask("run-1", "task-1");
    expect(fs.readdirSync(taskDir)).toEqual(["g2.lock"]);
    renameSync(from, to);
  });

  expect(() => zombie.renew()).toThrow(LockLostError);
  expect(fs.readdirSync(taskDir)).toEqual(["g2.lock"]);
});

test("a heartbeat is renewed by write-to-temp, fsync, then atomic rename onto the lock", async () => {
  const { locks, taskDir } = await newLocks();
  const { lock } = won(locks.claimTask("run-1", "task-1"));
  const path = join(taskDir, "g1.lock");
  const steps: string[] = [];

  const writeSync = fs.writeSync;
  const fsyncSync = fs.fsyncSync;
  const renameSync = fs.renameSync;
  spyOn(fs, "writeSync").mockImplementation(((fd: number, bytes: Buffer) => {
    steps.push("write");
    return writeSync(fd, bytes);
  }) as typeof fs.writeSync);
  spyOn(fs, "fsyncSync").mockImplementation((fd) => {
    steps.push("fsync");
    fsyncSync(fd);
  });
  spyOn(fs, "renameSync").mockImplementation((from, to) => {
    steps.push(`rename:${to === path ? "lock" : "elsewhere"}`);
    expect(from).not.toBe(path);
    renameSync(from, to);
  });

  lock.renew();

  expect(steps.slice(0, 3)).toEqual(["write", "fsync", "rename:lock"]);
  expect(fs.readdirSync(taskDir)).toEqual(["g1.lock"]);
});

test("a failed renewal leaves the old heartbeat whole and no temp file", async () => {
  const { locks, taskDir } = await newLocks();
  const { lock } = won(locks.claimTask("run-1", "task-1"));
  const before = fs.readFileSync(join(taskDir, "g1.lock"), "utf8");

  const spy = spyOn(fs, "fsyncSync").mockImplementation(() => {
    throw new Error("disk full");
  });
  expect(() => lock.renew()).toThrow("disk full");
  spy.mockRestore();

  expect(fs.readFileSync(join(taskDir, "g1.lock"), "utf8")).toBe(before);
  expect(fs.readdirSync(taskDir)).toEqual(["g1.lock"]);
});

test("a released lock can be claimed at once, and its generation is never reused", async () => {
  const { locks } = await newLocks();
  const { lock } = won(locks.claimTask("run-1", "task-1"));

  lock.release();

  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("releasing twice, or after losing the lock, leaves the new holder in place", async () => {
  const { locks, clock } = await newLocks();
  const { lock: zombie } = won(locks.claimTask("run-1", "task-1"));
  clock.set(START + TTL_MS);
  locks.claimTask("run-1", "task-1");

  zombie.release();
  zombie.release();

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
});

test("the generation comes from the Ledger, so it survives losing the lock files", async () => {
  const { workspace, locks } = await newLocks();
  locks.claimTask("run-1", "task-1");

  fs.rmSync(join(workspace, "memory", "locks"), { recursive: true });

  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("a takeover whose rename comes late can't displace the fresh lock", async () => {
  const { locks, clock } = await newLocks();
  locks.claimTask("run-1", "task-1");
  clock.set(START + TTL_MS);

  // This claimant has read the stale lock. Before its rename, a rival finishes a whole takeover.
  const renameSync = fs.renameSync;
  let rival: ReturnType<typeof locks.claimTask> | undefined;
  const spy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
    spy.mockRestore();
    rival = locks.claimTask("run-1", "task-1");
    renameSync(from, to);
  });

  const late = locks.claimTask("run-1", "task-1");

  expect(late).toEqual({ won: false, reason: "contended" });
  const { lock } = won(rival as NonNullable<typeof rival>);
  expect(lock.generation).toBe(2);
  lock.renew();
  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "held" });
});

test("only the claimant whose rename succeeds goes on to create the fresh lock", async () => {
  const { locks, clock, taskDir } = await newLocks();
  locks.claimTask("run-1", "task-1");
  clock.set(START + TTL_MS);

  // A rival's rename gets there first, and that rival hasn't created its lock yet.
  const renameSync = fs.renameSync;
  const spy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
    spy.mockRestore();
    renameSync(from, join(taskDir, "g1.0123abcd.aside"));
    renameSync(from, to);
  });

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "contended" });
  expect(fs.readdirSync(taskDir)).toEqual(["g1.0123abcd.aside"]);
});

test("a claimant whose create comes late, after a released generation, loses", async () => {
  const { locks } = await newLocks();

  // This claimant saw an empty directory. Before its create, a rival claims and releases.
  const openSync = fs.openSync;
  const spy = spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
    if (String(args[0]).endsWith("g1.lock")) {
      spy.mockRestore();
      won(locks.claimTask("run-1", "task-1")).lock.release();
    }
    return openSync(...args);
  }) as typeof fs.openSync);

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "contended" });

  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("a claimant whose create finds a rival's lock is refused without disturbing it", async () => {
  const { locks } = await newLocks();

  const openSync = fs.openSync;
  let rival: ReturnType<typeof locks.claimTask> | undefined;
  const spy = spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
    if (String(args[0]).endsWith("g1.lock")) {
      spy.mockRestore();
      rival = locks.claimTask("run-1", "task-1");
    }
    return openSync(...args);
  }) as typeof fs.openSync);

  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "contended" });
  won(rival as NonNullable<typeof rival>).lock.renew();
});

test("a takeover that dies between its rename and its create leaves the Task claimable", async () => {
  const { locks, clock } = await newLocks();
  locks.claimTask("run-1", "task-1");
  clock.set(START + TTL_MS);

  const openSync = fs.openSync;
  const spy = spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
    if (String(args[0]).endsWith("g2.lock")) {
      spy.mockRestore();
      throw new Error("killed here");
    }
    return openSync(...args);
  }) as typeof fs.openSync);
  expect(() => locks.claimTask("run-1", "task-1")).toThrow("killed here");

  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("a generation a dead claimant created but never recorded is not reused", async () => {
  const { clock, locks, taskDir } = await newLocks();
  fs.mkdirSync(taskDir, { recursive: true });
  const record = { token: "0".repeat(32), generation: 1, heartbeatAt: START, ttlMs: TTL_MS };
  fs.writeFileSync(join(taskDir, "g1.lock"), JSON.stringify(record));
  clock.set(START + TTL_MS);

  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("a failed Ledger write gives the lock back, so a claim never holds unrecorded", async () => {
  const { workspace, clock, ledger } = await newLocks();
  const failing = {
    ...ledger,
    append: () => {
      throw new Error("Ledger write failed");
    },
  };
  const locks = openLocks({ workspace, clock, identity: fakeIdentity, ledger: failing, ttlMs: TTL_MS });
  expect(() => locks.claimTask("run-1", "task-1")).toThrow("Ledger write failed");

  const healthy = openLocks({ workspace, clock, identity: fakeIdentity, ledger, ttlMs: TTL_MS });
  expect(won(healthy.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("a lock file with no readable heartbeat is held until its file age reaches the TTL", async () => {
  const { locks, clock, taskDir } = await newLocks();
  fs.mkdirSync(taskDir, { recursive: true });
  const path = join(taskDir, "g1.lock");
  fs.writeFileSync(path, "");
  const writtenAt = new Date(START);
  fs.utimesSync(path, writtenAt, writtenAt);

  clock.set(START + TTL_MS - 1000);
  expect(locks.claimTask("run-1", "task-1")).toEqual({ won: false, reason: "contended" });

  clock.set(START + TTL_MS);
  expect(won(locks.claimTask("run-1", "task-1")).lock.generation).toBe(2);
});

test("taking over removes the older generations' files", async () => {
  const { locks, clock, taskDir } = await newLocks();
  locks.claimTask("run-1", "task-1");
  clock.set(START + TTL_MS);
  locks.claimTask("run-1", "task-1");
  clock.set(START + TTL_MS * 2);

  locks.claimTask("run-1", "task-1");

  expect(fs.readdirSync(taskDir)).toEqual(["g3.lock"]);
});

test("a Run has its own lock of the same kind", async () => {
  const { locks, clock, ledger } = await newLocks();

  const first = won(locks.claimRun("run-1"));
  expect(first.lock.generation).toBe(1);
  expect(locks.claimRun("run-1")).toEqual({ won: false, reason: "held" });

  clock.set(START + TTL_MS);
  expect(won(locks.claimRun("run-1")).lock.generation).toBe(2);
  expect(() => first.lock.renew()).toThrow(LockLostError);

  const locked = ledger.load().events.filter((event) => event.type === "run.locked");
  expect(locked.map((event) => [event.runId, event.taskId, event.generation])).toEqual([
    ["run-1", undefined, 1],
    ["run-1", undefined, 2],
  ]);
});

test.each(["../escape", "a/b", "..", "", ".hidden", "a b"])(
  "an ID that isn't one safe path segment is refused: %p",
  async (id) => {
    const { workspace, locks } = await newLocks();

    expect(() => locks.claimTask("run-1", id)).toThrow("not a safe");
    expect(() => locks.claimTask(id, "task-1")).toThrow("not a safe");
    expect(() => locks.claimRun(id)).toThrow("not a safe");

    expect(fs.existsSync(join(workspace, "memory"))).toBe(false);
  },
);

test("AC-55: an ID holding this machine's identity makes no lock file", async () => {
  const { workspace, locks } = await newLocks();

  expect(() => locks.claimTask("run-1", "sentinel-user")).toThrow("taskId");

  expect(fs.existsSync(join(workspace, "memory"))).toBe(false);
});
