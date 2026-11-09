# 014: Verification, Evidence and diff check

**Goal:** A Task can only close on proof Foreman gathered itself, tied to the exact code.

**Blocked by:** [004: Check Engine](004-check-engine.md), [011: Task worktrees and Integration Branches](011-worktrees.md), [012: Adapter contract, fake Adapter and stubs](012-adapter-contract.md), [013: Worker environment and push hook](013-worker-environment.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-24:** a Task can't close when a command fails, when a Worker claims success without Evidence, or when no Evidence matches its current SHA.
- [ ] **AC-25:** the Ledger holds the command, exit code, output hash and SHA for each verification.
- [ ] **AC-26:** the diff check rejects an empty diff, an out-of-scope path, a forbidden path and a secret pattern.
- [ ] **AC-27:** a deleted test and an added skip marker are flagged for the reviewer.
- [ ] **AC-6:** an Adapter that misreports its diff has no effect on Evidence.
- [ ] **AC-48:** verification commands run in the same scrubbed environment as Workers.
- [ ] Output is stored in the Run's evidence directory with secret patterns redacted.

## Tests

- Real git and real commands in a temp repository.
- A fake Worker claiming success while tests fail.
- A commit added after verification invalidates the Evidence.
- An environment canary checked from inside a verify command.
