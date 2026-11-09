import { expect, test } from "bun:test";
import { recordApprovalRequest } from "../../src/approvals/requests.ts";
import { deriveActionId } from "../../src/ledger/action-id.ts";
import { openLedger } from "../../src/ledger/ledger.ts";
import { LedgerCorruptError } from "../../src/ledger/lines.ts";
import { replay } from "../../src/ledger/reducer.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";

const identity = {
  runId: "run-1",
  taskId: null,
  kind: "push",
  target: "origin refs/heads/topic",
  headSha: "b".repeat(40),
};

test("a request is recorded under the ID of the action it asks about", async () => {
  const ledger = openLedger({ workspace: await makeTempDir(), clock: fixedClock, identity: fakeIdentity });

  const actionId = recordApprovalRequest(ledger, { ...identity, diffSummary: "1 file changed" });

  expect(actionId).toBe(deriveActionId(identity));
  expect(ledger.load().state.approvalRequests.get(actionId)).toEqual({
    actionId,
    ...identity,
    diffSummary: "1 file changed",
    decision: "awaiting",
  });
});

test("a decision with no request before it is a corrupt Ledger", () => {
  const decision = {
    schemaVersion: 1,
    eventId: "event-1",
    at: "2026-01-02T03:04:05.000Z",
    type: "approval.granted",
    actionId: "action-1",
    runId: "run-1",
  };

  expect(() => replay([decision])).toThrow(LedgerCorruptError);
});
