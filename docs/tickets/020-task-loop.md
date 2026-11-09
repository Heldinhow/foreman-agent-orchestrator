# 020: Task execution loop on one Project

**Goal:** On a single Project, approved Tasks run from lock to closed: implement, verify, review, merge and re-verify. This completes the first full Pipeline, except for Outbound Actions.

**Blocked by:** [006: Task and Run locks](006-locks.md), [013: Worker environment and push hook](013-worker-environment.md), [014: Verification, Evidence and diff check](014-verification-evidence.md), [019: Starting a Run: Run-level Steps, Inbox and human Gates](019-run-steps-inbox.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-7 (single-Project part):** the default Pipeline completes all Steps on one Project with the fake Adapter.
- [ ] **AC-8:** a customized YAML Pipeline runs without any code change.
- [ ] **AC-9 (completes):** `evidence`, `diff-check`, `review-verdict` and `command` Gates each block when unmet and pass when met. Ticket 022 exercises the `integration` and `outbound` Gates.
- [ ] **AC-23:** a merge conflict returns the Task to a Worker rather than halting the Run.
- [ ] **AC-28:** the reviewer is never the implementer's Worker, and three failed rounds escalate to the Inbox.
- [ ] **AC-29:** Evidence on the merged SHA is required, and a merge that breaks tests reopens the Task.
- [ ] **AC-31 (completes):** a review verdict doesn't satisfy an Approval.
- [ ] Independent Tasks run in parallel up to `maxActiveWorkers`, counted from live Task Locks, and a Worker timeout counts as a failed round.

## Tests

- End-to-end at the app seam with real git.
- One scenario each for a conflict, a post-merge break and three failed rounds.
- A custom Pipeline fixture that adds a Step and a `command` Gate.
