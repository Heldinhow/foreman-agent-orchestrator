/**
 * A real process using the real Locks, for tests that need separate processes contending
 * or a holder that gets killed. It takes everything about the machine from its
 * environment, as Foreman will, and prints one JSON object per line.
 *
 *   lock-claimant.ts <workspace> race <ttlMs> <startAtMs> <stepMs> <tasks>
 *   lock-claimant.ts <workspace> chain <ttlMs> <claims>
 *   lock-claimant.ts <workspace> hold <ttlMs> <task|run>
 *   lock-claimant.ts <workspace> stall-mid-renew <ttlMs>
 *
 * `race` claims task-0, task-1, ... at the same moments as its rivals, keeping what it wins.
 * `chain` claims one Task again and again with a TTL short enough to expire between claims.
 * `hold` claims, prints the outcome, then obeys `renew`, `close` and `release` from stdin.
 */
import fs from "node:fs";
import { openLedger, StaleGenerationError } from "../../src/ledger/ledger.ts";
import { machineIdentity } from "../../src/ledger/privacy.ts";
import { LockLostError, openLocks, type Claim } from "../../src/locks/locks.ts";

const [workspace, mode, ttlMs, ...args] = process.argv.slice(2);
if (workspace === undefined) throw new Error("usage: lock-claimant.ts <workspace> <mode> <ttlMs> ...");

const clock = { now: () => new Date() };
const identity = machineIdentity();
const ledger = openLedger({ workspace, clock, identity });
const locks = openLocks({ workspace, clock, identity, ledger, ttlMs: Number(ttlMs) });

const print = (value: object) => process.stdout.write(`${JSON.stringify(value)}\n`);

const outcome = (claim: Claim) =>
  claim.won ? { won: true, generation: claim.lock.generation } : { won: false, reason: claim.reason };

function mustHold(claim: Claim) {
  if (!claim.won) throw new Error(`expected to hold the lock: ${claim.reason}`);
  return claim.lock;
}

switch (mode) {
  case "race": {
    const [startAt, step, tasks] = args.map(Number) as [number, number, number];
    for (let index = 0; index < tasks; index++) {
      while (Date.now() < startAt + index * step);
      print({ task: index, ...outcome(locks.claimTask("run-1", `task-${index}`)) });
    }
    break;
  }
  case "chain": {
    for (let index = 0; index < Number(args[0]); index++) {
      print(outcome(locks.claimTask("run-1", "task-1")));
    }
    break;
  }
  case "hold": {
    const claim = args[0] === "run" ? locks.claimRun("run-1") : locks.claimTask("run-1", "task-1");
    print(outcome(claim));
    const lock = mustHold(claim);
    const reader = Bun.stdin.stream().pipeThrough(new TextDecoderStream()).getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      for (const command of chunk.value.split("\n").filter(Boolean)) print(obey(command, lock));
    }
    break;
  }
  case "stall-mid-renew": {
    // The real renewal, stopped with half the record in its temp file.
    const lock = mustHold(locks.claimTask("run-1", "task-1"));
    const writeSync = fs.writeSync;
    Object.assign(fs, {
      writeSync(fd: number, bytes: Buffer) {
        writeSync(fd, bytes.subarray(0, Math.floor(bytes.length / 2)));
        writeSync(1, "mid-renew\n");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      },
    });
    lock.renew();
    break;
  }
  default:
    throw new Error(`unknown mode: ${mode}`);
}

function obey(command: string, lock: ReturnType<typeof mustHold>) {
  try {
    if (command === "renew") lock.renew();
    if (command === "release") lock.release();
    if (command === "close") {
      const { generation } = lock;
      ledger.append({ type: "task.closed", runId: "run-1", taskId: "task-1", generation });
    }
    return { command, ok: true };
  } catch (error) {
    if (error instanceof StaleGenerationError || error instanceof LockLostError) {
      return { command, ok: false, refused: error.name };
    }
    throw error;
  }
}
