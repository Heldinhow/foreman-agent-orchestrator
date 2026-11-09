# 029: Lesson extraction Step

**Goal:** A model can fill in a Lesson's root cause and detection hint, without being able to block or derail the Run.

**Blocked by:** [019: Starting a Run: Run-level Steps, Inbox and human Gates](019-run-steps-inbox.md), [027: Lesson store and capture](027-lesson-store.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-66:** failure of the `lesson-extraction` Step doesn't block a Run, and raises a notice.
- [ ] It runs read-only after any Task that had a failure, and at retro, with schema-validated output.
- [ ] Enrichment appends a superseding record and replaces `rootCause: "undetermined"`.

## Tests

- Fake Adapter returning valid output, invalid output and a failure.
- The Run completes in each case.
