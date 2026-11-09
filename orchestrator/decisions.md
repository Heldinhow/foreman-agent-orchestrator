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

## D-003: Git-based portability

- Authority: owner requested instruction changes, commit, push and clone on another computer.
- Decision: commit sanitized instructions and coordination records. Clone the same repository on the other computer; verify T3/thread accessibility and reconstruct local worktrees separately.
- Limit: no automatic migration of conversations, authentication, local processes or uncommitted changes is claimed.
