import { deriveActionId, type ActionIdentity } from "../ledger/action-id.ts";
import { APPROVAL_GRANTED, APPROVAL_REJECTED, APPROVAL_REQUESTED } from "../ledger/events.ts";
import type { Ledger } from "../ledger/ledger.ts";
import type { ApprovalRequestRecord } from "../ledger/reducer.ts";

export interface NewApprovalRequest extends ActionIdentity {
  diffSummary: string;
}

/** Records that something awaits a human decision, and returns the ID to decide it by. */
export function recordApprovalRequest(ledger: Ledger, request: NewApprovalRequest): string {
  const { diffSummary, ...identity } = request;
  const actionId = deriveActionId(identity);
  ledger.append({
    type: APPROVAL_REQUESTED,
    actionId,
    ...identity,
    data: { diffSummary },
  });
  return actionId;
}

/** The recorded request, as it stands now. Throws unless it's still waiting for a decision. */
export function awaitingRequest(ledger: Ledger, actionId: string): ApprovalRequestRecord {
  const request = ledger.load().state.approvalRequests.get(actionId);
  if (request === undefined) throw new Error(`no recorded request "${actionId}"`);
  if (request.decision !== "awaiting") {
    throw new Error(`request "${actionId}" is already ${request.decision}`);
  }
  return request;
}

export function recordGranted(
  ledger: Ledger,
  request: ApprovalRequestRecord,
  channel: string,
  displayHash: string,
): void {
  const { actionId, runId, taskId } = request;
  ledger.append({ type: APPROVAL_GRANTED, actionId, runId, taskId, data: { channel, displayHash } });
}

export function recordRejected(
  ledger: Ledger,
  request: ApprovalRequestRecord,
  channel: string,
): void {
  const { actionId, runId, taskId } = request;
  ledger.append({ type: APPROVAL_REJECTED, actionId, runId, taskId, data: { channel } });
}

export function renderRequest(request: ApprovalRequestRecord): string {
  return [
    "Approval requested",
    `  Action: ${oneLine(request.actionId)}`,
    `  Kind:   ${oneLine(request.kind)}`,
    `  Target: ${oneLine(request.target)}`,
    `  SHA:    ${oneLine(request.headSha)}`,
    `  Diff:   ${oneLine(request.diffSummary)}`,
  ].join("\n");
}

/** A value that spans lines could draw a false field under the real ones. */
function oneLine(value: string): string {
  return value.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ");
}
