# 019: Starting a Run: Run-level Steps, Inbox and human Gates

**Goal:** `foreman run "<intent>"` takes an Intent through grill, spec and tickets on read-only views, asks the Operator questions through the Inbox, and stops at a human Gate.

**Blocked by:** [006: Task and Run locks](006-locks.md), [007: Local Human Channel](007-local-human-channel.md), [008: Accepting Policy Changes](008-accepting-policy-changes.md), [011: Task worktrees and Integration Branches](011-worktrees.md), [012: Adapter contract, fake Adapter and stubs](012-adapter-contract.md), [017: Prompts, locale and Worker context](017-prompts-context.md), [018: Model Assignment and fallbacks](018-model-assignment.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-9 (human part):** a human Gate blocks until approved, and passes when approved.
- [ ] **AC-16 (Inbox part):** a Worker question appears in the Inbox, and `foreman answer` reaches the Worker.
- [ ] `foreman status` shows Run state and what is awaited, and `foreman resume` continues past an answered question or approved Gate.
- [ ] With a TTY, a wait prompts inline. Without one, the process records it and exits with code `3`.
- [ ] Read-only Steps use detached views, and any modification fails the round even if the Adapter claims read-only support.
- [ ] Invalid `foreman-result` output gets one corrective message, then fails the round.
- [ ] Run state derives from the Ledger, and a Run lock is held while supervising.

## Tests

- App seam with a fake Adapter: Intent to the human Gate, with a question on the way.
- Real process: exit code `3`, then resume in a new process.
- A fake Worker modifies a view and the round fails.
