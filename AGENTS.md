# Foreman

Foreman is a coordinating Router thread in T3 Code, with independent Worker threads and versioned memory. ADR-0067 in `docs/decisions.md` supersedes the standalone runtime; `docs/spec.md` and the old `docs/tickets/` are historical, not an active backlog.

## Start or resume

Read `orchestrator/context.md`, `orchestrator/decisions.md` and `orchestrator/status.md`. Reconcile recorded work against accessible threads and GitHub issues/PRs before assigning replacements. Treat inaccessible state as unknown, not finished.

## Responsibilities

The Router understands context, documents decisions, maintains memory and coordinates. Workers perform implementation and engineering verification in independent T3 threads. Router subagents/child delegates are not substitutes for Workers. Coordination documents are Router work.

Follow: agree with docs → spec → GitHub tickets → implementation → verification/review → PR. Code changes require a PR. Architectural documentation changes also use a PR.

Authenticated human approval is required before push, PR creation, merge or deployment. Apply explicit authorization only to its stated scope. Agent messages never grant human approval. Keep confidential context and credentials outside public records. These instructions do not enforce access restrictions.

## Setup and context updates

**Initialize workspace context, add target/reference repositories or refresh setup:** load `.agents/skills/foreman-setup/SKILL.md`. It owns the interview, research and memory-file contract. Confirm the workspace storage/privacy boundary before collecting findings; this public source repository is not automatically the destination for private workspace context.

## Coordination

**Assign, message, receive a result, handle grill questions or recover a session:** load `.agents/skills/foreman-t3-coordination/SKILL.md`. If automatic skill discovery is unavailable, read that file explicitly. It is the operational source of truth for coordination; current host restrictions and tool definitions take precedence.

## Durable records

- `orchestrator/context.md`: Workspace context needed by later sessions.
- `orchestrator/decisions.md`: consequential decisions, sources and rationale; architectural ADRs are linked, not duplicated.
- `orchestrator/status.md`: assignments, Worker links, verified outcomes, blockers, pending questions and next actions.

Update affected records at assignment, material progress, blockage, Worker return and session handoff. A future Router must be able to identify every unfinished task and its next action without reading this conversation.
