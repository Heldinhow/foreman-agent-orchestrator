import { createHash } from "node:crypto";

export interface ActionIdentity {
  runId: string;
  taskId?: string | null;
  kind: string;
  target: string;
  headSha: string;
}

/**
 * The same action always gets the same ID, so a repeat is recognized as that action
 * and an Approval can bind to it. Changing this derivation orphans existing Ledgers.
 */
export function deriveActionId(action: ActionIdentity): string {
  const { runId, taskId = null, kind, target, headSha } = action;
  const identity = JSON.stringify([runId, taskId, kind, target, headSha]);
  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}
