# 045: Example configs and .env.example

**Goal:** A reader can see a complete, valid configuration, and the repository has only placeholders.

**Blocked by:** [010: Workspace config and Workspace Graph](010-workspace-graph.md), [027: Lesson store and capture](027-lesson-store.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-77:** `config/foreman.example.yaml`, `config/workspace.example.yaml` and `config/lessons.example.jsonl` validate against their schemas.
- [ ] **AC-84 (part):** `.env.example` and the example configs contain only placeholders, enforced by a test.
- [ ] The example workspace shows three or more interdependent fake services, and each option is commented.

## Tests

- Validate each example through the real loaders.
- A placeholder test that fails on a realistic-looking value planted in a fixture.
