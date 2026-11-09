# 036: OpenCode isolation proof

**Goal:** Find out by test whether OpenCode can really enforce the Guard Policy, before anyone relies on it. The Adapter stays at `enforcesPolicy: false` unless this proves otherwise. This is the ADR-0033 requirement, and a negative result is an acceptable outcome.

**Blocked by:** [012: Adapter contract, fake Adapter and stubs](012-adapter-contract.md), [013: Worker environment and push hook](013-worker-environment.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-4:** the Adapter ships with `enforcesPolicy: false`, and it can change only with these proofs passing and the tested OpenCode version recorded:
  - [ ] A deny rule stops a read of a `.env` canary through the file tool.
  - [ ] A deny rule stops `cat .env` through the shell tool, and the canary value never appears in output.
  - [ ] `--standalone` tools receive the scrubbed environment: a supervisor canary isn't visible through `env`, and passed variables are.
- [ ] Read-only execution is proven, or the capability is declared `false`.
- [ ] Real `--format json` output is captured as fixtures, including a failure case.
- [ ] The result is recorded in the Adapter's documentation, including any failed proof.

## Tests

- Prefer a local fake provider scripting the tool calls, so no API key is needed.
- If OpenCode can't be configured that way, gate the tests behind `FOREMAN_LIVE_OPENCODE=1`, and keep the flag `false` until they've been run by hand and recorded.
- The refusal path from AC-3 applies for as long as the flag stays `false`.
