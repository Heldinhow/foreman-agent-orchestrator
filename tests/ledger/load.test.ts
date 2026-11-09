import { expect, test } from "bun:test";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { LedgerCorruptError, openLedger } from "../../src/ledger/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";

async function ledgerWithTwoLines() {
  const workspace = await makeTempDir();
  const ledger = openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });
  ledger.append({ type: "run.started", runId: "run-1" });
  ledger.append({ type: "run.started", runId: "run-2" });
  const path = join(workspace, "memory", "ledger.jsonl");
  return { ledger, path, text: await readFile(path, "utf8") };
}

const runIds = (events: { runId?: string }[]) => events.map((event) => event.runId);

test("AC-51: a torn final line is ignored and reported", async () => {
  const { ledger, path, text } = await ledgerWithTwoLines();
  await appendFile(path, '{"schemaVersion":1,"eventId":"to');

  const loaded = ledger.load();

  expect(runIds(loaded.events)).toEqual(["run-1", "run-2"]);
  expect(loaded.tornLines).toEqual([
    { line: 3, byteOffset: Buffer.byteLength(text), byteLength: 32 },
  ]);
});

test("a whole event that lost only its newline counts as torn, since its append never finished", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, '{"schemaVersion":1,"eventId":"unfinished","at":"2026-01-02T03:04:05.000Z","type":"run.started"}');

  const loaded = ledger.load();

  expect(loaded.events).toHaveLength(2);
  expect(loaded.tornLines).toHaveLength(1);
});

test("a final fragment cut inside a multi-byte character is still only a torn line", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, Buffer.from('{"schemaVersion":1,"data":{"note":"é').subarray(0, -1));

  expect(ledger.load().tornLines).toHaveLength(1);
});

test("a Ledger with no torn line reports none", async () => {
  const { ledger } = await ledgerWithTwoLines();

  expect(ledger.load().tornLines).toEqual([]);
});

test("appending after a torn line keeps the file's bytes and the new event loads", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, '{"schemaVersion":1,"eventId":"to');
  const before = await readFile(path);

  ledger.append({ type: "run.started", runId: "run-3" });

  const after = await readFile(path);
  expect(after.subarray(0, before.length).equals(before)).toBe(true);
  const loaded = ledger.load();
  expect(runIds(loaded.events)).toEqual(["run-1", "run-2", "run-3"]);
  expect(loaded.tornLines).toEqual([
    { line: 3, byteOffset: before.length - 32, byteLength: 32 },
  ]);
});

test("appending after a fragment shorter than a line's opening still recovers", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, '{"sche');

  ledger.append({ type: "run.started", runId: "run-3" });

  const loaded = ledger.load();
  expect(runIds(loaded.events)).toEqual(["run-1", "run-2", "run-3"]);
  expect(loaded.tornLines).toHaveLength(1);
});

test("appending after a fragment cut inside a multi-byte character still recovers", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, Buffer.from('{"schemaVersion":1,"data":{"note":"é').subarray(0, -1));

  ledger.append({ type: "run.started", runId: "run-3" });

  expect(runIds(ledger.load().events)).toEqual(["run-1", "run-2", "run-3"]);
});

test("two crashes in a row still recover the event written after them", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, '{"schemaVersion":1,"eventId":"first');
  await appendFile(path, '{"schemaVersion":1,"eventId":"second');

  ledger.append({ type: "run.started", runId: "run-3" });

  const loaded = ledger.load();
  expect(runIds(loaded.events)).toEqual(["run-1", "run-2", "run-3"]);
  expect(loaded.tornLines).toHaveLength(1);
});

test("an event nested in a torn line's data isn't mistaken for the recovered line", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  const nested = '{"schemaVersion":1,"eventId":"nested","at":"2026-01-02T03:04:05.000Z","type":"run.started","runId":"nested"}';
  await appendFile(path, `{"schemaVersion":1,"eventId":"outer","data":${nested}`);

  ledger.append({ type: "run.started", runId: "run-3" });

  expect(runIds(ledger.load().events)).toEqual(["run-1", "run-2", "run-3"]);
});

const validLine = (eventId: string) =>
  JSON.stringify({ schemaVersion: 1, eventId, at: "2026-01-02T03:04:05.000Z", type: "run.started" });

test.each<[string, string]>([
  ["text that isn't JSON", "not json"],
  ["a truncated line", '{"schemaVersion":1,"eventId":"cut'],
  ["a blank line", ""],
  ["JSON that isn't an object", "[1,2,3]"],
  ["a missing schemaVersion", '{"eventId":"a","at":"2026-01-02T03:04:05.000Z","type":"x"}'],
  ["a missing eventId", '{"schemaVersion":1,"at":"2026-01-02T03:04:05.000Z","type":"x"}'],
  ["an empty eventId", '{"schemaVersion":1,"eventId":"","at":"2026-01-02T03:04:05.000Z","type":"x"}'],
  ["a missing type", '{"schemaVersion":1,"eventId":"a","at":"2026-01-02T03:04:05.000Z"}'],
  ["a missing time", '{"schemaVersion":1,"eventId":"a","type":"x"}'],
  ["junk in front of an intact line", `junk${validLine("after-junk")}`],
  ["a pending action with no actionId", '{"schemaVersion":1,"eventId":"a","at":"2026-01-02T03:04:05.000Z","type":"action.pending","state":"pending"}'],
  ["a done action with no outcome", '{"schemaVersion":1,"eventId":"a","at":"2026-01-02T03:04:05.000Z","type":"action.done","state":"done","actionId":"x"}'],
])("AC-51: corruption before the final line stops with a clear error: %s", async (_name, corrupt) => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, `${corrupt}\n${validLine("last")}\n`);

  let error: unknown;
  try {
    ledger.load();
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(LedgerCorruptError);
  expect((error as LedgerCorruptError).line).toBe(3);
  expect((error as Error).message).toContain("memory/ledger.jsonl");
  expect((error as Error).message).toContain("line 3");
});

test("AC-51: invalid UTF-8 in an earlier line is corruption, not a silently altered value", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  const broken = Buffer.concat([
    Buffer.from('{"schemaVersion":1,"eventId":"bad'),
    Buffer.from([0xff]),
    Buffer.from('","at":"2026-01-02T03:04:05.000Z","type":"run.started"}\n'),
  ]);
  await appendFile(path, broken);
  await appendFile(path, `${validLine("last")}\n`);

  expect(() => ledger.load()).toThrow(LedgerCorruptError);
});

test("AC-51: a complete but unparseable final line was not torn by a write, so it stops too", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, "not json\n");

  expect(() => ledger.load()).toThrow(LedgerCorruptError);
});

test("AC-50: a repeated eventId is corruption", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, `${validLine("same")}\n${validLine("same")}\n`);

  expect(() => ledger.load()).toThrow(/line 4.*eventId/);
});

test("a line from a newer Foreman stops with a message saying so", async () => {
  const { ledger, path } = await ledgerWithTwoLines();
  await appendFile(path, '{"schemaVersion":2,"eventId":"a","at":"2026-01-02T03:04:05.000Z","type":"x"}\n');

  expect(() => ledger.load()).toThrow(/line 3.*schemaVersion 2.*newer/);
});
