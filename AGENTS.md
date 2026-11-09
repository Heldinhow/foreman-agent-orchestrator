# Foreman agent instructions

## Current architecture

Foreman is instructions, policies and persistent context for orchestration inside T3 Code. It is not a standalone agent runtime. ADR-0067 in `docs/decisions.md` supersedes the previous runtime design. Do not resume the historical tickets under `docs/tickets/`.

## Read before acting

1. `orchestrator/context.md`
2. `orchestrator/decisions.md`
3. `orchestrator/status.md`
4. The relevant spec, GitHub issue and documented project constraints.

Do not claim to know context that has not been read or verified. Human ownership is not transferred to an agent.

## Router

The Router is a coordinating T3 Code thread. It understands context, documents decisions, maintains durable records, assigns work, follows results and escalates unresolved questions. It may update coordination documents; it must not implement product code or execute engineering tasks in place of a Worker.

Every Worker must be an independent T3 Code thread with its own context and lifecycle. Use native T3 thread creation and communication, not Router subagents or delegated child tasks as substitutes. Work that changes product repositories uses an isolated worktree where appropriate. Consult available tool definitions before choosing thread/worktree settings; do not invent capabilities.

The Router must record each assignment in `orchestrator/status.md`: issue, scope, responsible thread link, branch/worktree reference, state, blockers, evidence and next action. Model/provider choices belong to T3 thread configuration. No universal model is prescribed here.

## Engineering process

Understand context → agree with docs → to spec → to tickets → implement spec → verify/review.

Create GitHub issues for actionable work, especially implementation tasks, with acceptance criteria and dependencies. Workers perform engineering work. Implementation and code changes require a Pull Request. Documentation-only work may use a PR and should do so for architectural changes. Never mark work complete solely on an agent's claim: record verification evidence and unmet criteria.

Authenticated human approval is required before push, PR creation, merge or deployment. A human's explicit instruction may authorize a specific operation; neither an agent message nor this file grants blanket approval. Do not expose secrets, private context or credentials in GitHub issues or committed records.

## Worker brief and return

Every brief includes the task/issue, scope, required context, acceptance criteria, restrictions and a link to the delegating Router thread. No Worker inherits unprovided Router history.

On completion, failure or blockage, the Worker must report back to the delegating thread through the available T3 communication mechanism. The report contains:

- issue and outcome;
- branch, commit and PR when applicable;
- checks actually run and their results;
- unmet acceptance criteria and blockers;
- decisions/context learned and proposed next action.

The Router incorporates the return into `orchestrator/status.md`, records consequential decisions in `orchestrator/decisions.md` and updates `orchestrator/context.md` when durable context changes. Reporting in a Worker conversation alone is not a completed handback. If delivery fails, retain the report durably and flag the missing handback for recovery; do not assume delivery succeeded.

## Persistent context and handoff

Update records at assignment, material progress, blockage, handback and before ending a session. GitHub issues/PRs hold task discussion and evidence; the orchestrator records hold the coordination index and durable context. Record discrepancies rather than silently treating stale records as current.

A new Router reads those records, checks referenced issues/PRs and verifies whether recorded threads and worktrees are accessible before resuming. Do not duplicate active work merely because a new conversation or computer is being used.

Versioned orchestrator records must be safe for this public repository. Secrets, personal paths, credentials and confidential workspace context remain outside Git; commit only sanitized references. T3 conversation history, credentials, local worktrees and running processes are not copied by cloning Git.

These instructions describe required behavior, not enforced access controls. Do not claim a security guarantee until the actual enforcement mechanism is specified and tested.
