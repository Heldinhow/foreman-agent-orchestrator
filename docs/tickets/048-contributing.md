# 048: CONTRIBUTING.md

**Goal:** A contributor can set up, test and write an Adapter with no API keys or accounts.

**Blocked by:** [012: Adapter contract, fake Adapter and stubs](012-adapter-contract.md), [037: OpenCode reference Adapter](037-opencode-adapter.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-84 (part):** `CONTRIBUTING.md` covers setup, tests, Adapter authoring, the no-personal-data rule and the no-telemetry rule.
- [ ] It explains the rule that no ticket or PR may hardcode a behaviour rule, and how to add a checkpoint with its Safety Default and leaf classification.
- [ ] It explains how to run the shared Adapter contract suite.

## Tests

- A test confirms that the file exists, has the required sections, and that the commands it names exist in `package.json`.
