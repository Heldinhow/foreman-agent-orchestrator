# 002: Ledger

**Goal:** Foreman can durably record what it intends and what it did, and rebuild state from that record after a crash.

**Blocked by:** [001: Project skeleton, CLI seam and build](001-project-skeleton.md)

**Status:** done

## Acceptance criteria

- [x] **AC-50:** every line has `schemaVersion` and `eventId`, and existing lines are never altered.
- [x] **AC-51:** a torn final line is ignored and reported, and corruption elsewhere stops with a clear error.
- [x] **AC-55 (Ledger part):** paths are Workspace-relative, and a sentinel `HOME`, `USER` and the machine's hostname never appear.
- [x] Each line is one `O_APPEND` write followed by fsync, and `pending` is durable before `done` can be written.
- [x] `actionId` is deterministic from Run, Task, kind, target and head SHA.
- [x] State comes from a pure reducer, and unfinished actions can be listed.

## Tests

- Real process: kill a writer mid-append, then confirm the file loads and reports the torn line.
- Concurrent appends from separate processes leave every line intact.
- Reducer: `pending` without `done` is listed, and `pending` then `done` isn't.
