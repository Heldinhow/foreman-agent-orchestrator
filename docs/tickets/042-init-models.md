# 042: `foreman init`: providers and Model Assignment

**Goal:** During onboarding, the Operator maps Steps and Roles to the models they actually have, with nothing hardcoded.

**Blocked by:** [018: Model Assignment and fallbacks](018-model-assignment.md), [041: `foreman init`: interview and generated Workspace](041-init-interview.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-105:** provider detection uses `opencode models` when available and environment variable names otherwise. A canary secret value never appears in any output, file or Ledger event, and the Operator confirms the result.
- [ ] The interview maps each Step, including `routing`, `lesson-extraction` and `policy-drafting`, and each Role, to a provider, model, variant and explicit fallbacks.
- [ ] Declared Roles get their adapter, prompts, tools and allowed Projects.
- [ ] With nothing detected, the Operator can still type values by hand.

## Tests

- Fake `opencode` on `PATH`, and none on `PATH`.
- A canary in the environment, checked across all outputs.
- The result validates and resolves through Model Assignment.
