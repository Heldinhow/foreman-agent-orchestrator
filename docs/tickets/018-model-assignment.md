# 018: Model Assignment and fallbacks

**Goal:** The Operator controls which model handles each Step and Role, and Foreman only falls back to models they listed.

**Blocked by:** [003: policy/defaults.yaml and Policy Layers](003-policy-layers.md), [012: Adapter contract, fake Adapter and stubs](012-adapter-contract.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-76:** precedence resolves as Role and Step, then Step, then Role, then Workspace default, and a provider failure moves through only the explicit fallback list.
- [ ] Only the failure categories `provider_unavailable`, `rate_limited` and `auth` trigger a fallback, and each one is logged.
- [ ] An empty or exhausted list halts the Step, and there is no implicit fallback.
- [ ] Model references stay opaque strings outside Adapters.

## Tests

- Precedence table.
- Fake Adapter returning each failure category and a poor-quality success, which must not fall back.
