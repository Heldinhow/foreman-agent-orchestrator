import type { Ledger } from "../ledger/ledger.ts";
import { ADAPTER_UNENFORCED_STARTED } from "../ledger/events.ts";
import type { Adapter, WorkerHandle, WorkerSpec } from "./contract.ts";

export class UnenforcedAdapterError extends Error {
  constructor(readonly adapterName: string) {
    super(
      `Adapter "${adapterName}" can't enforce the Guard Policy, so it won't start. Set allowUnenforced: true for it in Policy to accept that`,
    );
  }
}

export interface StartRequest {
  /** The Adapter's name in Policy. */
  name: string;
  adapter: Adapter;
  /** From accepted Policy. */
  allowUnenforced: boolean;
  spec: WorkerSpec;
  ledger: Ledger;
  runId: string;
  taskId: string | null;
}

/**
 * The one way a Worker starts. An Adapter that can't enforce the Guard Policy is refused
 * unless Policy opts in, and each start under the opt-in is logged before the Worker runs.
 */
export async function startWorker(request: StartRequest): Promise<WorkerHandle> {
  const { name, adapter, allowUnenforced, spec, ledger, runId, taskId } = request;
  if (!adapter.capabilities.enforcesPolicy) {
    if (!allowUnenforced) throw new UnenforcedAdapterError(name);
    ledger.append({ type: ADAPTER_UNENFORCED_STARTED, runId, taskId, data: { adapter: name } });
  }
  return adapter.start(spec);
}
