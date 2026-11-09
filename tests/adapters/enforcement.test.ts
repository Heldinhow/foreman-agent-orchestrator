import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createStubAdapter } from "../../src/adapters/stubs.ts";
import { startWorker, UnenforcedAdapterError } from "../../src/adapters/start.ts";
import { unenforcedAdapterWarnings } from "../../src/adapters/warnings.ts";
import { openLedger } from "../../src/ledger/ledger.ts";
import createFakeAdapter from "../fixtures/adapters/fake/adapter.ts";
import { fakeWorkerSpec, writeFakeScenario } from "../helpers/fake-adapter.ts";
import { createTempRepo } from "../helpers/git.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";

async function setup(enforcesPolicy: boolean) {
  const workspaceDir = await makeTempDir();
  await writeFakeScenario(workspaceDir, { enforcesPolicy, workers: [{ turns: [[{ say: "Done" }]] }] });
  const repo = await createTempRepo();
  await repo.commitFile("README.md", "fixture\n", "Initial commit");
  const ledger = openLedger({ workspace: workspaceDir, clock: fixedClock, identity: fakeIdentity });
  const adapter = createFakeAdapter({ name: "fake", workspaceDir });
  const spec = await fakeWorkerSpec(repo.path);
  const start = (allowUnenforced: boolean) =>
    startWorker({ name: "fake", adapter, allowUnenforced, spec, ledger, runId: "run-1", taskId: "task-1" });
  return { workspaceDir, ledger, start, adapterId: adapter.id };
}

describe("an Adapter that doesn't enforce the Guard Policy", () => {
  test("refuses to start without allowUnenforced, and starts nothing", async () => {
    const { workspaceDir, ledger, start } = await setup(false);

    await expect(start(false)).rejects.toBeInstanceOf(UnenforcedAdapterError);
    await expect(start(false)).rejects.toThrow("allowUnenforced: true");

    expect(await Bun.file(join(workspaceDir, "memory", "ledger.jsonl")).exists()).toBe(false);
    expect(unenforcedAdapterWarnings(ledger.load().state)).toEqual([]);
  });

  test("starts with allowUnenforced, logs each start to the Ledger and warns in status", async () => {
    const { ledger, start, adapterId } = await setup(false);

    const first = await start(true);
    await start(true);

    expect(first.adapterId).toBe(adapterId);
    const logged = ledger.load().events.filter((event) => event.type === "adapter.unenforced_started");
    expect(logged).toMatchObject([
      { runId: "run-1", taskId: "task-1", data: { adapter: "fake" } },
      { runId: "run-1", taskId: "task-1", data: { adapter: "fake" } },
    ]);
    expect(unenforcedAdapterWarnings(ledger.load().state)).toEqual([
      `Adapter "fake" doesn't enforce the Guard Policy and has started 2 Workers under allowUnenforced`,
    ]);
  });

  test("refuses a stub, which never enforces, until the opt-in, and then fails as not implemented", async () => {
    const { ledger } = await setup(false);
    const adapter = createStubAdapter("codex");
    const spec = await fakeWorkerSpec(await makeTempDir());
    const start = (allowUnenforced: boolean) =>
      startWorker({ name: "codex", adapter, allowUnenforced, spec, ledger, runId: "run-1", taskId: null });

    await expect(start(false)).rejects.toBeInstanceOf(UnenforcedAdapterError);
    await expect(start(true)).rejects.toThrow("not implemented");
  });
});

describe("an Adapter that enforces the Guard Policy", () => {
  test("starts without the opt-in and writes no warning, even when the opt-in is set", async () => {
    const { ledger, start } = await setup(true);

    await start(false);
    await start(true);

    expect(ledger.load().events).toEqual([]);
    expect(unenforcedAdapterWarnings(ledger.load().state)).toEqual([]);
  });
});
