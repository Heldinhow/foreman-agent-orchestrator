# 037: OpenCode reference Adapter

**Goal:** An Operator with OpenCode installed can run real Workers through it.

**Blocked by:** [018: Model Assignment and fallbacks](018-model-assignment.md), [036: OpenCode isolation proof](036-opencode-proof.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-1:** the shared contract suite passes against the OpenCode Adapter, using a fake `opencode` executable replaying the captured fixtures.
- [ ] **AC-76 (Adapter part):** failures map to the categories that trigger fallbacks, and the model is passed as an opaque `-m` value.
- [ ] It uses `opencode run --standalone --format json`, links `start` and `send` with `--session`, uses `--auto` only with explicit deny rules in place, and never uses `--worktree`.
- [ ] `bun test` needs no real OpenCode.

## Tests

- Contract suite with the fake executable.
- Argument assertions on what the fake executable received.
- A failure fixture for each category.
