# 044: `foreman-init` agent skill

**Goal:** An Operator working inside any coding agent can onboard and later change Foreman's behaviour from there.

**Blocked by:** [026: Natural-language Policy Changes](026-natural-language-policy.md), [041: `foreman init`: interview and generated Workspace](041-init-interview.md), [042: `foreman init`: providers and Model Assignment](042-init-models.md), [043: `foreman init --update`](043-init-update.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-98 (completes):** the skill writes an answers file and calls `foreman init --from`, so it uses the single write path, and an agent can prepare a Relaxation but can't apply it.
- [ ] `.agents/skills/foreman-init/SKILL.md` runs the interview one question at a time, each with a recommended answer, and works from T3 Code, Claude Code, OpenCode and Codex with no agent-specific tool required.
- [ ] It covers later behaviour changes through `foreman policy change`.
- [ ] It tells the Operator that an agent session can't grant Approvals or confirm a Relaxation.

## Tests

- A test parses the skill's documented answers format and confirms that a sample validates through `--from`.
- A sample with a Relaxation fails under non-interactive use, naming the keys.
