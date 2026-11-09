# 022: Integration Verification and approving a Run

**Goal:** The complete product path works: a multi-Project Intent ends with Integration Verification, then one Approval set in dependency order. This ticket is the main end-to-end proof.

**Blocked by:** [015: Approvals and the Outbound Executor](015-outbound-executor.md), [021: Router and cross-project ordering](021-router-cross-project.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-7:** the default Pipeline runs end to end on the fixture Workspace, from Intent to a completed Run.
- [ ] **AC-14 (integration part):** `integration.verify` receives `FOREMAN_WORKTREE_<PROJECT>` for every affected Project.
- [ ] **AC-55 (completes):** the sentinel check passes across the Ledger and locks after a full Run.
- [ ] `foreman approve <runId>` shows pending actions in topological order, one nonce covers the exact displayed list, each action gets its own bound Approval, and they execute in order.
- [ ] A failure midway halts the remaining actions, and failed Integration Verification blocks the outbound Gate.

## Tests

- End-to-end at the app seam, asserting order, Evidence, integration, then the effects on bare repositories and the fake Remote.
- Real process: the Approval set through a PTY.
- An action failing midway through the set.
