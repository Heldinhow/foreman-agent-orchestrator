import { afterEach, describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import { z } from "zod";
import {
  FAILURE_CATEGORIES,
  parseWorkerHandle,
  type Adapter,
  type WorkerHandle,
  type WorkerSpec,
  type WorkerStatus,
} from "../../src/adapters/contract.ts";
import { parseForemanResult } from "../../src/adapters/worker-output.ts";

/**
 * What a Worker must do in a contract test. An Adapter's harness arranges for it, however
 * that Adapter's agent can be scripted, such as a fake executable replaying a fixture.
 *
 * - `result`: finishes with a valid `foreman-result` block `{"summary": <any string>}`.
 * - `ask-then-result`: ends its first turn with a `foreman-question`, then does as `result`.
 * - `bad-then-result`: finishes with a malformed block, then does as `result`.
 * - `fail`: fails with a failure category.
 * - `hang`: keeps running until it's stopped.
 * - `edit`: writes the file `contract-edit.txt` and leaves it uncommitted, then does as `result`.
 */
export type ContractBehaviour = "result" | "ask-then-result" | "bad-then-result" | "fail" | "hang" | "edit";

/** What the Worker's process really saw on its latest turn, from outside the Adapter's own report. */
export interface WorkerObservation {
  env: Record<string, string>;
  cwd: string;
  /** Every message sent to it, oldest first, not counting the prompt. */
  messages: string[];
  model?: string;
}

export interface AdapterHarness {
  /** A new Adapter instance over the same sessions, as after a restart. */
  createAdapter(): Promise<Adapter>;
  /** A spec for a Worker that will behave as described, with a git repository as its `cwd`. */
  workerSpec(behaviour: ContractBehaviour, overrides?: Partial<WorkerSpec>): Promise<WorkerSpec>;
  observe(handle: WorkerHandle): Promise<WorkerObservation>;
  /** Whether the Worker's process is still there. */
  workerAlive(handle: WorkerHandle): Promise<boolean>;
  /** Kills the Worker's process from outside, as a crash would. */
  killWorker(handle: WorkerHandle): Promise<void>;
}

const ResultSchema = z.strictObject({ summary: z.string() });
const SUPERVISOR_CANARY = "CONTRACT_SUPERVISOR_CANARY";
const WAIT_MS = 10_000;
const CONTRACT_TEST_TIMEOUT_MS = 30_000;

async function settled(
  adapter: Adapter,
  handle: WorkerHandle,
  until: (status: WorkerStatus) => boolean = (status) => status.state !== "running",
): Promise<WorkerStatus> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const status = await adapter.status(handle);
    if (until(status)) return status;
    if (Date.now() > deadline) throw new Error(`Worker still ${JSON.stringify(status)} after ${WAIT_MS}ms`);
    await Bun.sleep(10);
  }
}

function outputOf(status: WorkerStatus): string {
  if (status.state !== "completed") throw new Error(`expected completed, got ${JSON.stringify(status)}`);
  return status.output;
}

/** One shared suite for every non-stub Adapter (ADR-0032). `setup` runs once per test. */
export function describeAdapterContract(name: string, setup: () => Promise<AdapterHarness>): void {
  describe(`Adapter contract: ${name}`, () => {
    const cleanups: (() => Promise<void>)[] = [];

    async function startWorker(behaviour: ContractBehaviour, overrides?: Partial<WorkerSpec>) {
      const harness = await setup();
      const adapter = await harness.createAdapter();
      const spec = await harness.workerSpec(behaviour, overrides);
      const handle = await adapter.start(spec);
      cleanups.push(() => adapter.cancel(handle));
      return { harness, adapter, spec, handle };
    }

    afterEach(async () => {
      await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
    });

    const contractTest = (title: string, body: () => Promise<void>) =>
      test(title, body, CONTRACT_TEST_TIMEOUT_MS);

    contractTest("declares an id and every capability as a boolean", async () => {
      const harness = await setup();
      const adapter = await harness.createAdapter();

      expect(adapter.id).toMatch(/\S/);
      expect(adapter.capabilities).toEqual({
        enforcesPolicy: expect.any(Boolean),
        resumableSessions: expect.any(Boolean),
        modelSelection: expect.any(Boolean),
        readOnly: expect.any(Boolean),
      });
    });

    contractTest("start returns a serializable handle that names the Adapter", async () => {
      const { adapter, handle } = await startWorker("result");

      const stored = JSON.parse(JSON.stringify(handle));

      expect(stored).toEqual(handle);
      expect(parseWorkerHandle(stored)).toEqual(handle);
      expect(handle.adapterId).toBe(adapter.id);
      expect(handle.sessionRef).toMatch(/\S/);
    });

    contractTest("a Worker that finishes is completed, with a final message holding its result", async () => {
      const { adapter, handle } = await startWorker("result");

      const status = await settled(adapter, handle);

      expect(parseForemanResult(outputOf(status), ResultSchema).ok).toBe(true);
    });

    contractTest("a handle read back from storage still resolves on a new instance if sessions resume", async () => {
      const { harness, adapter, handle } = await startWorker("result");
      const finished = await settled(adapter, handle);
      const stored = parseWorkerHandle(JSON.parse(JSON.stringify(handle)));

      const later = adapter.capabilities.resumableSessions ? await harness.createAdapter() : adapter;

      expect(await later.status(stored)).toEqual(finished);
    });

    contractTest("a Worker's question is waiting_input, and an answer reaches it", async () => {
      const { harness, adapter, handle } = await startWorker("ask-then-result");

      const asked = await settled(adapter, handle);
      expect(asked).toEqual({ state: "waiting_input", question: expect.stringMatching(/\S/) });

      await adapter.send(handle, "Use the first option.");
      const answered = await settled(adapter, handle, (status) => status.state === "completed");

      expect(parseForemanResult(outputOf(answered), ResultSchema).ok).toBe(true);
      expect((await harness.observe(handle)).messages).toEqual(["Use the first option."]);
    });

    contractTest("a Worker with invalid output can be given one corrective message", async () => {
      const { adapter, handle } = await startWorker("bad-then-result");

      const bad = await settled(adapter, handle);
      expect(parseForemanResult(outputOf(bad), ResultSchema).ok).toBe(false);

      await adapter.send(handle, "That block was invalid. Send it again.");
      const corrected = await settled(adapter, handle, (status) => status.state === "completed" && status.output !== outputOf(bad));

      expect(parseForemanResult(outputOf(corrected), ResultSchema).ok).toBe(true);
    });

    contractTest("a failing Worker is failed, with a known category and a message", async () => {
      const { adapter, handle } = await startWorker("fail");

      const status = await settled(adapter, handle);

      expect(status).toEqual({
        state: "failed",
        category: expect.any(String),
        message: expect.stringMatching(/\S/),
      });
      if (status.state === "failed") expect(FAILURE_CATEGORIES).toContain(status.category);
    });

    contractTest("a hanging Worker is running until cancelled, and then its process is gone", async () => {
      const { harness, adapter, handle } = await startWorker("hang");

      expect(await adapter.status(handle)).toEqual({ state: "running" });

      await adapter.cancel(handle);

      expect(await adapter.status(handle)).toEqual({ state: "cancelled" });
      expect(await harness.workerAlive(handle)).toBe(false);
    });

    contractTest("cancel is safe to repeat", async () => {
      const { adapter, handle } = await startWorker("hang");

      await adapter.cancel(handle);
      await adapter.cancel(handle);

      expect(await adapter.status(handle)).toEqual({ state: "cancelled" });
    });

    contractTest("cancelling a finished Worker leaves its status alone", async () => {
      const { adapter, handle } = await startWorker("result");
      const finished = await settled(adapter, handle);

      await adapter.cancel(handle);

      expect(await adapter.status(handle)).toEqual(finished);
    });

    contractTest("a Worker that dies doesn't stay running", async () => {
      const { harness, adapter, handle } = await startWorker("hang");

      await harness.killWorker(handle);

      const status = await settled(adapter, handle);
      expect(["failed", "unknown"]).toContain(status.state);
    });

    contractTest("a handle that can't be resolved is unknown, and sending to it rejects", async () => {
      const harness = await setup();
      const adapter = await harness.createAdapter();

      for (const handle of [
        { adapterId: adapter.id, sessionRef: "no-such-session" },
        { adapterId: adapter.id, sessionRef: "../../../../../../etc" },
        { adapterId: `${adapter.id}-other`, sessionRef: "no-such-session" },
      ]) {
        expect(await adapter.status(handle)).toEqual({ state: "unknown" });
        await expect(adapter.send(handle, "hello")).rejects.toThrow();
        await adapter.cancel(handle);
      }
    });

    contractTest("a handle for another Adapter doesn't resolve, even with a real session", async () => {
      const { adapter, handle } = await startWorker("result");
      await settled(adapter, handle);

      expect(await adapter.status({ ...handle, adapterId: `${adapter.id}-other` })).toEqual({ state: "unknown" });
    });

    contractTest("send rejects while a Worker is running, and after it failed or was cancelled", async () => {
      const hanging = await startWorker("hang");
      await expect(hanging.adapter.send(hanging.handle, "hello")).rejects.toThrow();
      await hanging.adapter.cancel(hanging.handle);
      await expect(hanging.adapter.send(hanging.handle, "hello")).rejects.toThrow();

      const failing = await startWorker("fail");
      await settled(failing.adapter, failing.handle);
      await expect(failing.adapter.send(failing.handle, "hello")).rejects.toThrow();
    });

    contractTest("diff reports a Worker's uncommitted edit", async () => {
      const { adapter, handle } = await startWorker("edit");
      await settled(adapter, handle);

      expect(await adapter.diff(handle)).toContain("contract-edit.txt");
    });

    contractTest("a Worker gets exactly the environment in its spec and nothing of the supervisor's", async () => {
      process.env[SUPERVISOR_CANARY] = "canary-value";
      try {
        const { harness, adapter, spec, handle } = await startWorker("result");
        await settled(adapter, handle);

        const { env } = await harness.observe(handle);

        expect(env).toEqual(spec.env);
        expect(JSON.stringify(env)).not.toContain("canary-value");
      } finally {
        delete process.env[SUPERVISOR_CANARY];
      }
    });

    contractTest("a Worker runs in its spec's cwd", async () => {
      const { harness, adapter, spec, handle } = await startWorker("result");
      await settled(adapter, handle);

      const { cwd } = await harness.observe(handle);

      expect(await realpath(cwd)).toBe(await realpath(spec.cwd));
    });

    contractTest("a model reference reaches the Worker untouched if the Adapter selects models", async () => {
      const { harness, adapter, handle } = await startWorker("result", { model: "provider/model#variant" });
      await settled(adapter, handle);

      const { model } = await harness.observe(handle);

      expect(model).toBe(adapter.capabilities.modelSelection ? "provider/model#variant" : undefined);
    });
  });
}
