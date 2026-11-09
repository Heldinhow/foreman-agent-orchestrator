# 047: README.pt-BR.md and pt-BR prompts

**Goal:** A pt-BR team gets the same information and the same behaviour in its language.

**Blocked by:** [017: Prompts, locale and Worker context](017-prompts-context.md), [044: `foreman-init` agent skill](044-foreman-init-skill.md), [046: README.md](046-readme-en.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-81:** every English prompt has a pt-BR counterpart, and both READMEs have matching section structure.
- [ ] **AC-80:** with `locale: pt-BR`, Workers get the shipped pt-BR prompts, not only fixtures.
- [ ] Config keys, CLI commands and Ledger events stay in English in both.
- [ ] The README cross-links to its translation.

## Tests

- Parity tests for prompts and README headings.
- A Run with `locale: pt-BR` and the fake Adapter asserts on prompt content.
