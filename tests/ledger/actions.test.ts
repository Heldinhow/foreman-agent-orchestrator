import { afterEach, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import { join } from "node:path";
import { deriveActionId } from "../../src/ledger/action-id.ts";
import { LedgerCorruptError, openLedger } from "../../src/ledger/ledger.ts";
import { unfinishedActions } from "../../src/ledger/reducer.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";

const push = {
  runId: "run-1",
  taskId: "task-1",
  kind: "push",
  target: "refs/heads/foreman/run-1",
  headSha: "0123456789abcdef0123456789abcdef01234567",
};

async function newLedger() {
  const workspace = await makeTempDir();
  return {
    workspace,
    path: join(workspace, "memory", "ledger.jsonl"),
    ledger: openLedger({ workspace, clock: fixedClock, identity: fakeIdentity }),
  };
}

const unfinishedIds = (ledger: ReturnType<typeof openLedger>) =>
  unfinishedActions(ledger.load().state).map((action) => action.actionId);

// Each syscall test installs its own spies.
const spies: { mockRestore(): void }[] = [];

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

test("recording an action writes the spec's line shape with the derived actionId", async () => {
  const { ledger, path } = await newLedger();

  ledger.recordPending({ ...push, generation: 3, data: { policyHash: "abc" } });

  const line = JSON.parse(fs.readFileSync(path, "utf8"));
  expect(line).toMatchObject({
    schemaVersion: 1,
    type: "action.pending",
    state: "pending",
    actionId: deriveActionId(push),
    ...push,
    generation: 3,
    data: { policyHash: "abc" },
  });
});

test("a recorded action is unfinished until its done is recorded", async () => {
  const { ledger } = await newLedger();

  const { actionId } = ledger.recordPending(push);
  expect(unfinishedIds(ledger)).toEqual([actionId]);

  ledger.recordDone(actionId, "pushed");
  expect(unfinishedIds(ledger)).toEqual([]);
});

test("a done line names the action and its outcome", async () => {
  const { ledger, path } = await newLedger();

  const { actionId } = ledger.recordPending(push);
  ledger.recordDone(actionId, "pushed", { remoteSha: push.headSha });

  const lines = fs.readFileSync(path, "utf8").trimEnd().split("\n");
  expect(JSON.parse(lines[1] as string)).toMatchObject({
    type: "action.done",
    state: "done",
    outcome: "pushed",
    actionId: actionId,
    ...push,
    data: { remoteSha: push.headSha },
  });
});

test("done is refused when no pending for that action is in the Ledger", async () => {
  const { ledger, path } = await newLedger();

  expect(() => ledger.recordDone("no-such-action", "pushed")).toThrow(/no-such-action/);
  expect(fs.existsSync(path)).toBe(false);
});

test("a second done is refused", async () => {
  const { ledger } = await newLedger();
  const { actionId } = ledger.recordPending(push);
  ledger.recordDone(actionId, "pushed");

  expect(() => ledger.recordDone(actionId, "pushed")).toThrow(/pending/);
});

test("after a restart, done can be recorded for an action found unfinished", async () => {
  const { ledger, workspace } = await newLedger();
  const { actionId } = ledger.recordPending(push);

  const restarted = openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });
  restarted.recordDone(actionId, "already-landed");

  expect(restarted.load().state.actions.get(actionId)?.outcome).toBe("already-landed");
});

test("a torn pending never became an action", async () => {
  const { ledger, path } = await newLedger();
  ledger.recordPending(push);
  const whole = fs.readFileSync(path);
  fs.truncateSync(path, whole.length - 10);

  const loaded = ledger.load();

  expect(unfinishedActions(loaded.state)).toEqual([]);
  expect(loaded.tornLines).toHaveLength(1);
});

test("a damaged action history stops the load", async () => {
  const { ledger, path } = await newLedger();
  const { actionId } = ledger.recordPending(push);
  ledger.recordDone(actionId, "pushed");
  const [pendingLine, doneLine] = fs.readFileSync(path, "utf8").trimEnd().split("\n");
  expect(pendingLine).toBeDefined();
  fs.writeFileSync(path, `${doneLine}\n`);

  expect(() => ledger.load()).toThrow(LedgerCorruptError);
});

/**
 * These observe the syscalls because the criterion is about them: the crash and
 * concurrency tests can't tell an fsync from none on a machine that didn't lose power.
 */
function recordSyscalls() {
  const calls: string[] = [];
  const openSync = fs.openSync;
  const writeSync = fs.writeSync;
  const fsyncSync = fs.fsyncSync;
  spies.push(
    spyOn(fs, "openSync").mockImplementation(((path: fs.PathLike, flags: number, mode?: number) => {
      if (String(path).endsWith("ledger.jsonl")) {
        calls.push((flags & fs.constants.O_APPEND) !== 0 ? "open:append" : "open:other");
      }
      return openSync(path, flags, mode);
    }) as typeof fs.openSync),
    spyOn(fs, "writeSync").mockImplementation(((fd: number, ...rest: [Buffer]) => {
      calls.push("write");
      return writeSync(fd, ...rest);
    }) as typeof fs.writeSync),
    spyOn(fs, "fsyncSync").mockImplementation(((fd: number) => {
      calls.push("fsync");
      return fsyncSync(fd);
    }) as typeof fs.fsyncSync),
  );
  return calls;
}

test("each line is one O_APPEND write followed by fsync", async () => {
  const { ledger } = await newLedger();
  ledger.append({ type: "run.started", runId: "run-1" });
  const calls = recordSyscalls();

  ledger.append({ type: "run.started", runId: "run-2" });

  expect(calls).toEqual(["open:append", "write", "fsync"]);
});

test("pending is written and fsynced before done is written", async () => {
  const { ledger } = await newLedger();
  ledger.append({ type: "run.started", runId: "run-1" });
  const calls = recordSyscalls();

  const { actionId } = ledger.recordPending(push);
  ledger.recordDone(actionId, "pushed");

  expect(calls).toEqual(["open:append", "write", "fsync", "open:append", "write", "fsync"]);
});

test("the first line also makes the new file durable in its directory", async () => {
  const { ledger } = await newLedger();
  const calls = recordSyscalls();

  ledger.append({ type: "run.started", runId: "run-1" });

  expect(calls).toEqual(["open:append", "write", "fsync", "fsync", "fsync"]);
});

test("a failed fsync means the pending isn't durable, so the action must not proceed", async () => {
  const { ledger } = await newLedger();
  spies.push(
    spyOn(fs, "fsyncSync").mockImplementation(() => {
      throw new Error("EIO: i/o error, fsync");
    }),
  );

  expect(() => ledger.recordPending(push)).toThrow(/EIO/);
});

test("a short write fails rather than sending the rest as a second write", async () => {
  const { ledger, path } = await newLedger();
  ledger.append({ type: "run.started", runId: "run-1" });
  const writeSync = fs.writeSync;
  let writes = 0;
  spies.push(
    spyOn(fs, "writeSync").mockImplementation(((fd: number, bytes: Buffer) => {
      writes += 1;
      return writeSync(fd, bytes.subarray(0, 10));
    }) as typeof fs.writeSync),
  );

  expect(() => ledger.append({ type: "run.started", runId: "run-2" })).toThrow(/short write/i);
  expect(writes).toBe(1);
  for (const spy of spies.splice(0)) spy.mockRestore();

  expect(fs.existsSync(path)).toBe(true);
  expect(ledger.load().tornLines).toHaveLength(1);
  ledger.append({ type: "run.started", runId: "run-3" });
  expect(ledger.load().events.map((event) => event.runId)).toEqual(["run-1", "run-3"]);
});
