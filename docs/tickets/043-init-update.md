# 043: `foreman init --update`

**Goal:** An Operator can re-run onboarding as repositories change, without losing anything they decided.

**Blocked by:** [040: Scanner: other stacks and contracts](040-scanner-stacks.md), [041: `foreman init`: interview and generated Workspace](041-init-interview.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-72:** `--update` preserves confirmed Edges and edited Context Files, adds new detections as `detected`, and reports confirmed Edges with missing evidence.
- [ ] **AC-98 (`--update` part):** its changes go through the Policy path, so they're shown and confirmed.
- [ ] Running it twice with no repository change produces no diff.

## Tests

- Change a fixture repository, then update and inspect the result.
- A hand-edited `context.md` and confirmed Edge survive unchanged.
