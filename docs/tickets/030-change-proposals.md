# 030: Change Proposals

**Goal:** Lessons can suggest process improvements for the Operator to decide on, but can never relax Policy.

**Blocked by:** [005: Relaxation classification and deviations report](005-relaxation-classification.md), [008: Accepting Policy Changes](008-accepting-policy-changes.md), [029: Lesson extraction Step](029-lesson-extraction.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-61:** a Change Proposal removing a deny rule, enabling `allowUnenforced`, adding passthrough, widening a Role, weakening a Mode, removing a Gate or lowering `minOccurrences` is rejected, never queued, and logged.
- [ ] **AC-62:** a proposal targeting `memory/`, `.env`, the user override, a symlink out of bounds or Foreman's installation is rejected.
- [ ] **AC-63:** `foreman proposals list`, `show`, `approve` and `reject` work, and an agent can't approve one.
- [ ] **AC-64:** a stale base hash isn't applied, and an approved proposal targeting a Project lands on a local branch and pushes nothing.
- [ ] **AC-65:** each Lesson and proposal event is in the Ledger.
- [ ] A Workspace-target proposal applies as a Policy Change with `origin: change-proposal`.

## Tests

- Table of each relaxing change.
- Path attacks, including a symlink.
- The full approve path through a PTY, then history and revert.
