/**
 * A real process using the real Ledger, for tests that kill a writer or run several at
 * once. It takes everything about the machine from its environment, as Foreman will.
 *
 *   ledger-writer.ts <workspace> append <writerId> <count> <padBytes>
 *   ledger-writer.ts <workspace> giant-line <bytes>
 *   ledger-writer.ts <workspace> stall-mid-append
 *   ledger-writer.ts <workspace> pending-then-wait <runId>
 *   ledger-writer.ts <workspace> record-path <path>
 */
import fs from "node:fs";
import { openLedger } from "../../src/ledger/ledger.ts";
import { machineIdentity } from "../../src/ledger/privacy.ts";

const [workspace, mode, ...args] = process.argv.slice(2);
if (workspace === undefined) throw new Error("usage: ledger-writer.ts <workspace> <mode> ...");

const ledger = openLedger({
  workspace,
  clock: { now: () => new Date() },
  identity: machineIdentity(),
});

switch (mode) {
  case "append": {
    const [writerId, count, padBytes] = args;
    const pad = "x".repeat(Number(padBytes));
    for (let sequence = 0; sequence < Number(count); sequence++) {
      ledger.append({ type: "writer.line", runId: writerId, data: { sequence, pad } });
    }
    break;
  }
  case "giant-line": {
    ledger.append({ type: "writer.line", data: { pad: "x".repeat(Number(args[0])) } });
    break;
  }
  case "stall-mid-append": {
    // The real append, stopped inside its write with half the line in the file. Whether
    // a kill can cut a real write depends on the filesystem, so this makes the point exact.
    const writeSync = fs.writeSync;
    Object.assign(fs, {
      writeSync(fd: number, bytes: Buffer) {
        writeSync(fd, bytes.subarray(0, Math.floor(bytes.length / 2)));
        writeSync(1, "mid-append\n");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      },
    });
    ledger.append({ type: "writer.line", runId: "never-finished" });
    break;
  }
  case "pending-then-wait": {
    const { actionId } = ledger.recordPending({
      runId: args[0] as string,
      taskId: "task-1",
      kind: "push",
      target: "refs/heads/foreman/run-1",
      headSha: "0123456789abcdef0123456789abcdef01234567",
    });
    process.stdout.write(`${actionId}\n`);
    await new Promise(() => setInterval(() => {}, 1000));
    break;
  }
  case "record-path": {
    ledger.append({ type: "worktree.created", runId: "run-1", data: { path: args[0] } });
    break;
  }
  default:
    throw new Error(`unknown mode: ${mode}`);
}
