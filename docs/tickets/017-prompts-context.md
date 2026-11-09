# 017: Prompts, locale and Worker context

**Goal:** Workers receive a predictable context assembled from prompts, Context Files, and the Task, in the configured locale.

**Blocked by:** [003: policy/defaults.yaml and Policy Layers](003-policy-layers.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-80 (mechanism part):** with `locale: pt-BR`, a Worker gets the pt-BR prompt, and a missing prompt falls back to English.
- [ ] Resolution order is Workspace override for the locale, built-in for the locale, then built-in English.
- [ ] Context is assembled in the spec's order, within a token cap, trimming Lessons first and then Project notes, with trimming logged.
- [ ] The Worker protocol and the Task are never trimmed.
- [ ] English prompts exist for each Step, including `routing`, `lesson-extraction` and `policy-drafting`, plus the Worker protocol.

## Tests

- Resolution table across override, locale and fallback, using fixture prompts.
- A small cap trims in the defined order and logs it.
- A test confirms each declared Step has a prompt.
