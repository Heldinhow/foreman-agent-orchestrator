# 015: Approvals and the Outbound Executor

**Goal:** Nothing leaves the machine except through one path that checks Policy and an exact Approval, shown here by pushing to a local bare repository and calling a fake Remote.

**Blocked by:** [002: Ledger](002-ledger.md), [004: Check Engine](004-check-engine.md), [007: Local Human Channel](007-local-human-channel.md), [011: Task worktrees and Integration Branches](011-worktrees.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-30:** in Propose Mode, no Outbound Action happens without an Approval, and the bare repository and fake Remote show no effect.
- [ ] **AC-31 (Worker and Inbox part):** a Worker's message and an Inbox answer each fail to satisfy an Approval.
- [ ] **AC-34:** changing the head after Approval invalidates it, a used Approval can't be reused, and an expired one is refused.
- [ ] **AC-38:** Autonomous Mode permits only `push` to `foreman/*` and `draft-pr`, and allowlisting merge or deploy in a file has no effect until confirmed.
- [ ] **AC-39:** a push to a default branch or a forced push is refused in every Mode.
- [ ] **AC-43:** Foreman's own push doesn't run a hook planted by a Worker, and a changed git config blocks Outbound Actions.
- [ ] The `Remote` interface is defined, with a fake implementation and a shared contract suite.

## Tests

- Real git against a bare repository, and a fake Remote with call recording.
- Static check that only the Executor can call the push and Remote write paths.
- A hook planted in the repository and a canary to show it didn't run.
