# Orchestrator decision index

Record future coordination decisions here with source, rationale, affected work and any superseded decision. Architectural ADRs remain in `docs/decisions.md`; link them rather than creating competing versions.

## D-001: T3-native orchestration

- Authority: owner confirmation; ADR-0067.
- Decision: Router instructions and durable memory, with independent T3 Worker threads; no standalone Foreman runtime or Router subagents as Workers.
- Reason: preserve independent working contexts and resumable coordination in the environment the operator uses.
- Impact: freeze the old spec/tickets; write the replacement spec before implementation.

## D-002: Durable status and Worker handback

- Authority: owner's context and long-duration memory requirements.
- Decision: track each assignment and implementation state in `orchestrator/status.md`. Workers return outcomes to the delegating Router; the Router updates durable context and decisions.
- Reason: a result left only in a Worker conversation is insufficient for continuity.

## D-004: Grill questions go through the Router

- Authority: direct owner instruction, tracked in GitHub issue #4.
- Decision: during `grill-with-docs`, the Worker asks the delegating Router. The Router answers from known context and recorded decisions; when it does not know, it asks the human and relays the answer to the Worker.
- Record: preserve question identity, source of the answer, pending state and the relevant document updates. Do not turn an agent response into human approval.

## D-003: Git-based portability

- Authority: owner requested instruction changes, commit, push and clone on another computer.
- Decision: commit sanitized instructions and coordination records. Clone the same repository on the other computer; verify T3/thread accessibility and reconstruct local worktrees separately.
- Limit: no automatic migration of conversations, authentication, local processes or uncommitted changes is claimed.

## D-005: Context-first setup

- Authority: owner requested grilling-based onboarding, repository research and explicit memory files; tracked in issue #6.
- Decision: `foreman-setup` interviews the operator about product and workspace, registers target/reference sources and assigns evidence-backed research to independent T3 Workers. Its memory reference defines the authoritative file ownership; findings, human decisions and hypotheses remain distinguishable.
- Confirmation: unresolved gaps and their impact remain explicit. Setup readiness requires human confirmation for its stated scope, not a claim of total context.
- Use: later demands retrieve relevant context and gaps; roadmap proposals use product goals and dependencies but require human priorities and confirmation. Private workspace context does not belong in the public source repository.

## D-006: Repository routing and cold-session memory

- Authority: owner's example of a workspace with about seven related service repositories and requirement to recover context in every new session; tracked in issue #7.
- Decision: setup records every repository's identity, responsibility, domain ownership, dependencies and verified or unresolved T3 binding in an explicit workspace catalog. Task routing uses that evidence before a Worker is launched.
- Continuity: each new Router runs a bootstrap reading core records and all registered project summaries, reconciles current work and records missing coverage. Material discussions, corrections and findings are persisted incrementally; history links to authoritative records and handoff captures continuation state.
- Limit: instructions require reading/reconciliation but do not guarantee automatic injection, unlimited context or crash-safe writes. Missing/private/stale context remains an explicit blocker for affected work, not an excuse to guess.
