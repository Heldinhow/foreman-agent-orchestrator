# 025: Hot reload and per-Task Policy Snapshots

**Goal:** A confirmed Policy Change applies to new Tasks with no restart, while in-flight Tasks keep the Policy they started with. This ticket holds two of the owner's required tests.

**Blocked by:** [009: Policy history and revert](009-policy-history-revert.md), [015: Approvals and the Outbound Executor](015-outbound-executor.md), [020: Task execution loop on one Project](020-task-loop.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-88:** the Policy Owner relaxes a Safety Default through a confirmed diff. It takes effect for a new Task without a restart, the Ledger holds who, when, why, hashes and key, and `foreman policy revert` restores the previous behaviour for the next new Task as a new event.
- [ ] **AC-89:** an in-flight Task keeps its old snapshot after a Policy Change, including across `foreman resume`, a new Task in the same Run uses the new one, and each `task.locked` event has its Policy hash.
- [ ] **AC-103:** a tightening accepted during a Run stops a not-yet-attempted Outbound Action, and the action records the Policy hash it used.
- [ ] A Run's Pipeline shape stays pinned to its start, and a Run-level Step uses the Policy current when it starts.

## Tests

- App seam: two Tasks with a Policy Change between their starts.
- Real process: change Policy from a second process during a Run.
- Crash and resume with an in-flight Task after a Policy Change.
