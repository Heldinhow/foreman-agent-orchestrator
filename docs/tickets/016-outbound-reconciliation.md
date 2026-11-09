# 016: Crash reconciliation for Outbound Actions

**Goal:** After a crash at any moment around an Outbound Action, `foreman resume` works out what really happened, so nothing is done twice.

**Blocked by:** [015: Approvals and the Outbound Executor](015-outbound-executor.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-52:** killing the process at each point around each action kind and then resuming produces one push, one PR and one merge.
- [ ] **AC-53:** after an interrupted push that landed, resume records it done without pushing again. If it didn't land, a valid Approval is required to retry.
- [ ] **AC-54:** an interrupted deploy with no `deploy.check` raises a notice and doesn't run again, and one with a check is reconciled by it.

## Tests

- Real process: inject `SIGKILL` before the action, during it and before `done`, for each kind.
- Count effects on the bare repository and fake Remote after each resume.
