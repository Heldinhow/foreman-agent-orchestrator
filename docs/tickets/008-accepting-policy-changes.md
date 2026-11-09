# 008: Accepting Policy Changes

**Goal:** The Policy Owner can edit a Policy file, see the diff with Relaxations marked, confirm it, and have it recorded. Until then the edit has no effect, whoever made it.

**Blocked by:** [002: Ledger](002-ledger.md), [005: Relaxation classification and deviations report](005-relaxation-classification.md), [007: Local Human Channel](007-local-human-channel.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-91:** a hand edit has no effect until `foreman policy apply`. A Relaxation needs a TTY and the right nonce, and refuses `--yes`, no TTY and a wrong nonce. A nonce covers one exact diff. Tightening and neutral changes succeed with `--yes`.
- [ ] **AC-95 (completes):** a Relaxation is marked `RELAXATION`, with before and after values, above the rest of the diff.
- [ ] **AC-100:** a tampered snapshot stops Foreman. A Workspace with no accepted snapshot runs on built-in defaults alone. Changed built-in defaults are shown as a change to confirm.
- [ ] **AC-102:** the Ledger event holds only the layer name for the user override, and the sentinel check still passes.
- [ ] `policy.changed` records `changeId`, `origin`, channel, owner alias, time, why, before and after hashes, and Relaxation key names.
- [ ] Drift between files and the accepted snapshot is reported by each command.
- [ ] Invalid Policy is refused as a whole.

## Tests

- App seam: edit, confirm, inspect the Ledger and the snapshot store.
- Real process: the Relaxation refusals, reusing the PTY helper.
- Change a file after the diff is shown, then confirm that the old nonce fails.
- Alternative `policy/defaults.yaml` to simulate an upgrade.
