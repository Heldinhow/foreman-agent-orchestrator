# 006: Task and Run locks

**Goal:** Two Workers can never hold the same Task, two supervisors can never drive the same Run, and an abandoned lock can be recovered safely.

**Blocked by:** [002: Ledger](002-ledger.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-17:** concurrent claimants in separate processes contend for one Task, and exactly one wins, across many iterations.
- [ ] **AC-18:** an expired heartbeat can be taken over, and concurrent takeovers produce exactly one winner.
- [ ] **AC-19:** a live heartbeat can't be taken over.
- [ ] **AC-20:** a Task-closing event from a lost holder with an old generation is refused.
- [ ] **AC-55 (lock part):** lock files hold only a random token, generation, heartbeat time and TTL.
- [ ] Heartbeats are renewed with write-to-temp, fsync and atomic rename.

## Tests

- Real process: many parallel claimants and takeovers, counting winners.
- Injected clock: expiry and renewal at the TTL boundary.
- Sentinel check on lock file content.
