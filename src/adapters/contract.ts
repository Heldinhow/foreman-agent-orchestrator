import { z } from "zod";
import type { Policy } from "../policy/schema.ts";

/**
 * What every Adapter implements (ADR-0032), so Foreman can drive any coding agent as a
 * Worker through one seam. The shared contract suite in `tests/adapters` runs against
 * every non-stub Adapter.
 */
export interface Adapter {
  readonly id: string;
  readonly capabilities: AdapterCapabilities;
  start(spec: WorkerSpec): Promise<WorkerHandle>;
  /** Starts the Worker's next turn. Rejects unless the Worker has finished its current one. */
  send(handle: WorkerHandle, message: string): Promise<void>;
  /** Never rejects for a handle it can't resolve: that's the `unknown` state. */
  status(handle: WorkerHandle): Promise<WorkerStatus>;
  /** Informational. Gates read git directly, so a misreported diff can't affect Evidence. */
  diff(handle: WorkerHandle): Promise<string>;
  /** Stops a Worker, and is safe to repeat. A Worker that has already finished stays as it is. */
  cancel(handle: WorkerHandle): Promise<void>;
}

export interface AdapterCapabilities {
  enforcesPolicy: boolean;
  resumableSessions: boolean;
  modelSelection: boolean;
  readOnly: boolean;
}

/** The rules handed to an Adapter that can enforce them. */
export type GuardPolicy = Policy["policies"]["guard"];

export interface SandboxSpec {
  type: Exclude<Policy["policies"]["sandbox"], "none">;
}

export interface WorkerSpec {
  cwd: string;
  prompt: string;
  /** The exact environment: the Adapter adds nothing and inherits nothing. */
  env: Record<string, string>;
  policy: GuardPolicy;
  /** An opaque `provider/model#variant` reference that only the Adapter interprets. */
  model?: string;
  readOnly: boolean;
  sandbox?: SandboxSpec;
}

/** Serializable, so it can be persisted and used to resume after a restart. */
export interface WorkerHandle {
  adapterId: string;
  sessionRef: string;
}

const WorkerHandleSchema = z.strictObject({
  adapterId: z.string().min(1),
  sessionRef: z.string().min(1),
});

/** Reads a handle back from storage. Throws if the value isn't a handle. */
export function parseWorkerHandle(value: unknown): WorkerHandle {
  return WorkerHandleSchema.parse(value);
}

/** Only the first three move a Model Assignment to its next fallback. */
export const FAILURE_CATEGORIES = ["provider_unavailable", "rate_limited", "auth", "worker_error"] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export type WorkerStatus =
  | { state: "running" }
  | { state: "waiting_input"; question: string }
  | { state: "completed"; output: string }
  | { state: "failed"; category: FailureCategory; message: string }
  | { state: "cancelled" }
  /** The handle can't be resolved, for example after a crash. */
  | { state: "unknown" };
