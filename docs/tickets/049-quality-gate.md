# 049: Offline, no-telemetry and deliverables gate

**Goal:** The whole repository passes one clean gate with no network or external accounts.

**Blocked by:** [016: Crash reconciliation for Outbound Actions](016-outbound-reconciliation.md), [023: Halt, retry, abandon and Task recovery](023-halt-retry-recovery.md), [024: Answered by Router](024-answered-by-router.md), [028: Lesson retrieval and injection](028-lesson-injection.md), [034: Policy confirmation through a PR](034-policy-from-pr.md), [035: Optional polling](035-polling.md), [038: Optional bubblewrap Sandbox](038-sandbox.md), [045: Example configs and .env.example](045-example-configs.md), [046: README.md](046-readme-en.md), [047: README.pt-BR.md and pt-BR prompts](047-pt-br-locale.md), [048: CONTRIBUTING.md](048-contributing.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-82:** `bun test`, `bun run typecheck` and `bun run build` pass with no network, API keys, real OpenCode or GitHub access, and the built `dist/` entry passes a smoke test including `policy/defaults.yaml`.
- [ ] **AC-83:** network use appears only in the Remote module, enforced by a static test, and no telemetry exists.
- [ ] **AC-84:** all deliverables exist, with `LICENSE` as MIT with the required copyright.
- [ ] Every acceptance criterion in the spec has at least one test, and any test skipped for a missing tool gives a visible reason.

## Tests

- A static test for network calls, which fails on a planted `fetch` in a fixture.
- A deliverables test.
- Run the full suite with network access blocked where the platform allows, such as under bubblewrap.
