# 026: Natural-language Policy Changes

**Goal:** The Policy Owner can say "from now on, do X when Y" and get a validated diff to confirm.

**Blocked by:** [008: Accepting Policy Changes](008-accepting-policy-changes.md), [019: Starting a Run: Run-level Steps, Inbox and human Gates](019-run-steps-inbox.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-92:** `foreman policy change` uses the fake Adapter to produce a schema-valid draft and shows it, and nothing applies before confirmation. Declining leaves Policy unchanged. An invalid draft is refused as a whole. A draft containing a Relaxation is flagged and needs the Relaxation path, even when the text didn't ask for one. With no Adapter configured, the command fails clearly.
- [ ] `foreman policy apply --from <file>` accepts a drafted diff through the same path.
- [ ] The drafting Worker is read-only, and the command refuses under the Worker marker.

## Tests

- Fake Adapter returning a valid draft, an invalid one, and one with an unrequested Relaxation.
- Decline, then confirm that the Ledger and snapshot are unchanged.
