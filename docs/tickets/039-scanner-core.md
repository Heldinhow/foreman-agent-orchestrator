# 039: Scanner core with JS/TS and Docker

**Goal:** Foreman can inspect a hostile repository safely and propose Edges, starting with the most common stack.

**Blocked by:** [004: Check Engine](004-check-engine.md), [010: Workspace config and Workspace Graph](010-workspace-graph.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-67:** the Scan proposes the expected Edges with evidence and doesn't execute anything, so a planted `postinstall` and a script canary stay untouched.
- [ ] **AC-68:** it doesn't read `.env`, doesn't follow a symlink out of the repository, and stores no matched values in evidence.
- [ ] **AC-69 (part):** `package.json`, bun, npm and pnpm workspaces, tsconfig paths, Docker and compose each have a fixture and detection test.
- [ ] It suggests build, test and verify commands, and Edges carry confidence and `source: detected`.
- [ ] File reads go through the Check Engine at `scan.read`.

## Tests

- Fixtures per stack.
- Hostile fixtures: `postinstall` canary, `.env` canary, escaping symlink and an oversized file.
