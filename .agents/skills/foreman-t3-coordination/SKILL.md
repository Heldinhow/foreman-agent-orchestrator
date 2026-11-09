---
name: foreman-t3-coordination
description: Coordinate T3 Code Workers when assigning work, messaging a thread, handling grill-with-docs questions, receiving results, or recovering a session.
license: MIT
compatibility: Requires native T3 Code thread tools; no executable dependencies.
---

# T3 coordination

Read repository `AGENTS.md` first. In a new Router session, complete `references/bootstrap.md` before coordinating. Follow repository responsibility and approval rules throughout. Workers are independent T3 threads; the Router maintains the coordination record.

Choose the current branch below. Run assignment steps only for new work; incoming questions and results do not require a new assignment.

## Assign

1. **Reconcile.** Match the issue against recorded assignments and accessible Worker threads. For uncertain state, read `references/recovery.md` before proceeding.
   **Done:** no unresolved duplicate assignment exists; the task and its dependencies are ready under the agreed spec.

2. **Route.** Read `references/routing.md` to map the demand to repository responsibilities, dependency impact and actual T3 project bindings.
   **Done:** selected projects, rationale and impact/order are recorded; ambiguous ownership or an unresolved binding blocks the affected assignment.

3. **Discover.** Read the installed definitions of the required native thread tools through host tool discovery. If unavailable or refused, record a blocker and escalate; internal databases or shell transports are not fallback interfaces.
   **Done:** the required operations, permission ceiling and operator-selected provider/model are available, or the assignment is explicitly blocked.

4. **Brief.** Load `references/protocol.md` and fill its Worker brief. Honor the agreed concurrency limit; use one writer until a parallel-writing limit is agreed.
   **Done:** the brief identifies the issue, scope, acceptance criteria, dependencies, verification, authorization scope and delegating Router's verified thread link.

5. **Launch.** Read `references/threads.md`. Create the independent Worker with native workspace binding and save its returned link and assignment record.
   **Done:** exactly one Worker is recorded with its actual workspace/branch, state and next action. An ambiguous launch result returns to reconciliation, not another launch.

## Message

Read `references/threads.md` before sending a follow-up, correction or stop request.

**Done:** the intended thread and delivery mode are verified, actual delivery status is recorded, and any pending outcome remains pending. Successful delivery is not task completion.

## Grill questions

During `grill-with-docs`, read `references/grill.md` for Worker → Router → human escalation and answer provenance.

**Done:** the answer is sourced, delivered to the originating Worker and incorporated into the grill documents, or its pending owner and next action are recorded.

## Worker return

Load the return fields in `references/protocol.md` and read the relevant Worker report/activity. Compare the outcome with the issue's acceptance criteria and evidence references. Assign missing engineering verification to an independent Worker.

Update status, consequential decisions and durable context in their designated records. Apply the protocol's state meanings; retain unmet criteria and pending approvals.

**Done:** every reported outcome is accounted for, evidence is attributed, unresolved work has a next owner/action, and receipt is recorded. A final report without reconciliation is not a completed handback.

## Recover or end a session

Read `references/recovery.md` for pending handbacks, inaccessible threads, clone/resume or session handoff.

**Done:** every unfinished assignment and question has a recorded state and next action; uncertain remote/local execution remains explicitly uncertain.

## Review this skill

When authoring or validating these instructions, use `references/acceptance.md`. Research provenance and discovery limitations are in `references/sources.md`; they are not runtime dependencies.
