# 009: Policy history and revert

**Goal:** The Policy Owner can see how Policy changed over time and undo a change.

**Blocked by:** [008: Accepting Policy Changes](008-accepting-policy-changes.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-93:** `foreman policy history` lists changes. A revert is a new event and never edits earlier lines. A revert that relaxes something needs a Human Channel.
- [ ] A revert restores source files from the snapshot before the change.
- [ ] If later changes touched the same keys, the resulting diff is shown rather than merged silently.

## Tests

- Revert a Relaxation and confirm it needs no nonce, since it tightens.
- Revert a tightening and confirm it needs one.
- Revert an earlier change with a later change on the same key.
