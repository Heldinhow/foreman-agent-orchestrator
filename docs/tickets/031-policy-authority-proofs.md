# 031: Policy authority proofs

**Goal:** Prove the core promise of the adaptive design: the Policy Owner can change anything, and nothing else can. This ticket holds the owner's remaining required test.

**Blocked by:** [025: Hot reload and per-Task Policy Snapshots](025-hot-reload-snapshots.md), [030: Change Proposals](030-change-proposals.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-90:** `foreman policy apply`, `change` and `revert` refuse under the Worker marker, including an ancestor-only marker. A Worker's direct edit of a Policy file has no effect and raises a drift notice. A relaxing Change Proposal is rejected. A comment asking for it does nothing. The Policy Owner can still make the same change afterwards.
- [ ] **AC-96:** each Safety Default can be relaxed with an observable effect: an Outbound Action without an Approval for each of push, PR, merge and deploy, a Worker reading a `.env` canary, a Task closing without Evidence and recorded as such, and an agent message satisfying an Approval.
- [ ] **AC-97:** the schema has no key for the mechanism, and an attempt to add one is an unknown-key error. With `acceptAgentMessages: true`, a Worker's message still can't confirm a Policy Change.
- [ ] **AC-41:** Worker text, prompts and Lessons can't change a check's result, and a check keeps using the Task's snapshot when files on disk differ.

## Tests

- Real process for the Worker-marker refusals.
- Parametrized across each Safety Default: run it with the default, relax it, run it again, revert it.
- A fake Worker that edits a Policy file during its Task.
