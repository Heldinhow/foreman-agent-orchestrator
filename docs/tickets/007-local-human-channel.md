# 007: Local Human Channel

**Goal:** `foreman approve` and `foreman reject` work on a recorded request, and only a human at a real terminal can approve. Later tickets reuse this check for Outbound Actions and Policy Changes.

**Blocked by:** [001: Project skeleton, CLI seam and build](001-project-skeleton.md), [002: Ledger](002-ledger.md)

**Status:** done

## Acceptance criteria

- [x] **AC-32:** `foreman approve` refuses with no TTY, with a wrong nonce, under the Worker marker, and when only an ancestor has the marker (`env -u` from a marked process).
- [x] **AC-33:** it succeeds with a real PTY and the right nonce.
- [x] **AC-85:** the shipped CLI has no flag, environment variable or hidden option that bypasses the Human Channel.
- [x] The nonce is random per invocation, read from the terminal rather than stdin, and bound to the hash of what is displayed.
- [x] If ancestors can't be inspected, it refuses.
- [x] `foreman reject` refuses under the Worker marker and needs no TTY.

## Tests

- Real process, using `script` for the PTY success path. It skips with a visible reason if `script` is missing.
- Real process: a marked parent spawns `env -u FOREMAN_WORKER foreman approve`.
- Static test on the composition root: only tests can inject a test Human Channel.
