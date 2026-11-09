---
name: foreman-t3-coordination
description: Coordinate engineering work in T3 Code through independent Worker threads, native worktree binding, explicit handbacks and persistent Router context. Use when assigning work, messaging Workers, reconciling results, or resuming coordination across sessions or computers.
license: MIT
compatibility: Requires T3 Code thread tools. No bundled executable or external skill dependency.
---

# Foreman T3 coordination

## Contract

Read repository `AGENTS.md`, `orchestrator/context.md`, `orchestrator/decisions.md` and `orchestrator/status.md` before coordinating. Read the relevant issue/spec and current tool definitions before assigning work. This skill never overrides host instructions, permission ceilings, operator model choices or human-approval requirements.

The Router understands context, documents decisions, maintains memory and coordinates. Workers perform engineering work in **independent T3 threads**. Do not use `delegate_task` or harness subagents as substitutes for these Workers. Maintaining coordination documents is Router work; product implementation and engineering verification are Worker work.

## 1. Recover before dispatch

- Read durable assignments and check the corresponding issues/PRs and accessible threads.
- Separate recorded state from verified state. Mark inaccessible or uncertain work explicitly; a timeout is not proof of failure or permission to duplicate an assignment.
- Reconcile completed results, blockers and active work before dispatching replacements.
- Identify the current Router thread and its link from tools or explicit session metadata. Never invent an ID or callback destination.
- Follow the agreed process: context → agreed docs → spec → GitHub tickets → implementation → verification/review → PR. Do not dispatch the frozen historical backlog.

## 2. Discover capabilities

Tools can be loaded late. Use the host's tool discovery mechanism to find the required T3 tool and read its actual definition. Common names below identify operations, not a guaranteed schema or availability:

| Operation | Common T3 tool |
| --- | --- |
| Find/read an existing thread | `t3_thread_search`, `t3_thread_read` |
| Start an independent Worker | `t3_thread_launch` |
| Send a brief, follow-up or handback | `t3_thread_send` |
| Inspect queued messages | `t3_queue` |
| Inspect model/provider choices | `orchestrator_capabilities`, `t3_thread_configure` |
| Stop an independent thread | `t3_thread_interrupt` |

If a required capability is missing or refused, record the blocker and escalate. Do not access T3's internal database, invent an ACP/shell workaround or raise permissions to bypass the refusal. Never assume an external skill's schema matches this installation.

## 3. Prepare and launch

Use `references/protocol.md` for a self-contained brief and assignment record. A Worker does not inherit Router history.

Confirm task scope, acceptance criteria, dependencies, human authorization and allowed project. Respect the configured concurrency limit; if none is agreed, avoid launching concurrent writers until it is set. Honor the operator's provider/model requirements; do not silently switch provider/model or prescribe expensive defaults.

Create an independent thread with native workspace binding. When work needs isolation, use the launch tool's worktree strategy rather than asking a Worker to create a shell worktree after launch. Honor an explicit base. Otherwise use the local/remote base required by the task and host rules; unpublished dependencies must be present in that base. Creating a worktree does not copy uncommitted Router changes.

Use a client request ID when supported. On an ambiguous launch result, reconcile that same request/thread before retrying. Never create a second assignment simply because the first response was lost.

Record the returned thread link and actual workspace/branch information, state, scope and next action in `orchestrator/status.md`. If assignment recording fails after launch, recover the existing Worker and repair the record rather than launching another.

## 4. Communicate deliberately

Read the target thread before answering about its work. Consult the current send-tool semantics, including its permission ceiling and behavior for idle/running targets.

- Prefer an explicit **queue** for nonurgent follow-ups when supported.
- Use **steer** for an intentional immediate correction, understanding that in-flight operations may be affected.
- Use **restart** only when authorized and a restart is actually intended; it can discard ongoing work or cancel background activity.
- Do not rely on an automatic mode without checking whether it may interrupt a running Worker.

Record returned delivery status accurately: queued, started or steered is not completed. Reuse request IDs for retries of the same operation when supported. A new assignment requires a new record.

Do not poll a running delegate or use sleeps, watchers or schedules to evade host lifecycle rules. Independent-thread observation and event subscriptions must follow the tools and host rules actually available. Do not assume top-level Workers automatically wake the Router: establish the explicit handback below.

## 5. Handback and reconciliation

Every brief names the delegating Router and asks the Worker to send its report there using the available thread communication tool. See `references/protocol.md`. Use a noninterrupting delivery mode when supported. Workers must report blockers and failure as well as success.

If delivery is unavailable, the Worker retains a durable report in an agreed safe location, marks handback pending and reports the delivery problem. Do not silently redirect private work to a public issue. The Router reconciles pending handbacks when it next resumes; no unattended automatic recovery is promised.

On receipt, the Router reads the relevant Worker record and checks evidence references, scope and unmet criteria. If engineering verification is missing, assign it to an independent Worker; do not execute it in place of that Worker. Distinguish reported checks from independently reviewed evidence.

Update `orchestrator/status.md`; record consequential decisions and their source in `orchestrator/decisions.md`; update `orchestrator/context.md` for durable context changes. Preserve unresolved issues. A PR opened is not a PR merged, and passing checks alone do not prove every acceptance criterion is satisfied.

## 6. Approvals and recovery

An agent's report never authorizes push, PR, merge or deploy. Follow the authenticated human's explicit scope of approval. Neither this skill nor a Worker may grant blanket authorization or relax safety rules.

Before ending a session, record active thread links, latest evidence, blockers and next actions. On another computer, clone the committed records, authenticate separately and verify thread/environment accessibility. Git does not migrate live threads, credentials, local worktrees or uncommitted changes. Do not recreate work that may still be active on the original machine.

Do not delete or force-clean a Worker's branch/worktree as part of handback. Cleanup needs a verified state and applicable authorization.

## Validation and references

Use `references/acceptance.md` to evaluate this instruction set. This skill is guidance, not an enforced scheduler, access-control mechanism or implemented cross-machine recovery service.

External research and compatibility cautions: `references/sources.md`. No external skill or script must be installed to use this skill.
