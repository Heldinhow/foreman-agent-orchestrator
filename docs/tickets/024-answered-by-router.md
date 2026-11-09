# 024: Answered by Router

**Goal:** When enabled, Foreman can answer a Worker's question from recorded decisions, and it can prove the answer came from them.

**Blocked by:** [019: Starting a Run: Run-level Steps, Inbox and human Gates](019-run-steps-inbox.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-16 (completes):** with `answerFromDecisions` enabled, a verified citation produces an answer logged as Answered by Router, and a fabricated citation goes to the Inbox.
- [ ] It's off by default, and questions tied to a Gate always go to the Inbox.

## Tests

- A fake Worker returning a citation that exists, one that doesn't, and one close but not verbatim.
- A Gate-tied question with the feature enabled.
