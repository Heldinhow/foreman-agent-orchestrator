# 012: Adapter contract, fake Adapter and stubs

**Goal:** Foreman can drive any Worker through one contract, and refuses an Adapter that can't enforce the Guard Policy unless the Operator opts in.

**Blocked by:** [004: Check Engine](004-check-engine.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-1 (fake part):** the shared contract suite passes against the fake Adapter.
- [ ] **AC-2:** stubs for T3 Code, Claude Code, Codex and Pi declare `enforcesPolicy: false` and fail with a clear "not implemented" error.
- [ ] **AC-3:** an Adapter with `enforcesPolicy: false` refuses to start without `allowUnenforced: true`. With the opt-in it starts, logs that to the Ledger and shows a warning in `foreman status`.
- [ ] The fake Adapter lives in fixtures and loads through the local-module mechanism, and the shipped CLI has no built-in fake.
- [ ] The fake plays declarative scenarios: edit, commit, leave uncommitted, ask, fail, emit bad output, hang, misreport its diff, try to read `.env`.
- [ ] `WorkerHandle` is serializable, and `foreman-result` and `foreman-question` blocks are parsed from Worker output.

## Tests

- Contract suite, written so any non-stub Adapter can run it.
- Real child processes for fake Workers.
- Local-module loading from an explicit path, and refusal of a missing or invalid module.
