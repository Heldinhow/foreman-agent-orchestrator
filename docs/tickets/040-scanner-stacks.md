# 040: Scanner: other stacks and contracts

**Goal:** The Scan covers the rest of the v0.1 stacks and detects API and event relationships.

**Blocked by:** [039: Scanner core with JS/TS and Docker](039-scanner-core.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-69:** Python, Go, Java and Kotlin, OpenAPI, AsyncAPI, proto files and the HTTP-client and env-URL heuristics each have a fixture and detection test.
- [ ] Edge confidence matches the spec's table.
- [ ] The env-URL heuristic reads `.env.example` only, and evidence holds the key name and never the value.

## Tests

- Fixtures per stack.
- A full Scan of the fixture Workspace produces the expected graph.
