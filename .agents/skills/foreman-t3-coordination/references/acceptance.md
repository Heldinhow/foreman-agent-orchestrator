# Skill specification and review scenarios

Issue: https://github.com/Heldinhow/foreman-agent-orchestrator/issues/3

## Scope

A portable repository skill for the Router/Worker coordination protocol agreed in ADR-0067. This is documentation, not a new runtime. It relies on current native T3 tool definitions and does not install third-party helpers.

## Acceptance scenarios

Review these statically now; run live exercises later through authorized independent Worker threads. Do not describe a static review as a live integration test.

1. **Independent launch:** an authorized task produces an independent T3 Worker with native workspace binding, a self-contained brief and a durable assignment record, not a Router subagent.
2. **Missing capability:** unavailable/refused launch or communication is recorded as a blocker, with no shell/database bypass or permission escalation.
3. **Ambiguous launch:** lost response causes reconciliation/retry of the same request rather than a second Worker.
4. **Nonurgent message:** follow-up explicitly requests noninterrupting queue delivery where supported and records the actual tool response without claiming completion.
5. **Completed/partial Worker:** a report returns to the delegating Router; unmet criteria survive into status; verification claims remain attributable to their source.
6. **Failed handback:** the report is retained safely, handback stays pending, and the Router reconciles it on resumption without assuming an automatic wakeup.
7. **Human gate:** an agent saying “approved” cannot authorize push, PR, merge or deployment.
8. **Restart/other computer:** a new Router reads committed context, reconciles accessible threads/issues and flags machine-local missing state without launching duplicate work.
9. **Model and scope:** no default expensive model, silent provider substitution, host-rule override or unrequested destructive cleanup.
10. **Evidence gap:** the Router assigns missing engineering verification rather than performing the Worker's job itself.

11. **Known grill answer:** the Worker asks the Router; the Router cites an existing decision, records the answer and replies to that Worker without unnecessarily escalating to the human.
12. **Unknown grill answer:** the Router records the pending question, asks the human, then relays the sourced answer to the originating Worker. Dependent decisions remain unsettled until answered; duplicate question delivery does not cause duplicate escalation.
13. **Approval distinction:** a grill answer from the Router cannot masquerade as human authorization; uncertainty, conflicting context or missing authority requires escalation.

14. **Seven-service routing:** given a documented catalog containing accounts, catalog, orders, inventory, payments, notifications and a web client (fictional examples), a demand to change order confirmation routes from documented ownership to orders, checks relevant payment/event/client dependencies and selects actual verified T3 bindings. A name match alone is insufficient; reference-only sources cannot receive changes.
15. **Cold-session memory:** with no previous conversation, bootstrap reads every registered project summary and the complete core records. Missing/truncated/private records produce coverage gaps and block affected work rather than an invented memory claim.
16. **Interrupted persistence:** a material answer whose write failed remains unsaved context with a next action; later work cannot assume it is safely persisted. A missing final handoff is recovered from incremental records and live observations.

## AI Hero authoring review

- The description lists distinct invocation branches and keeps model invocation enabled intentionally.
- Every main action has a checkable completion criterion, including explicit pending/blocked outcomes.
- Branch-specific mechanics are reached through conditional pointers rather than loaded into every path.
- Repository authority and memory ownership live in AGENTS.md; operational procedures live in the skill references; templates hold record fields.
- Review each added instruction for a behavioral effect, not merely shorter wording. Retain hard safety guardrails.

Static walkthroughs of known/unknown grill answers, ambiguous launch and failed handback should locate the branch, source record and pending completion criterion without depending on hidden context. These walkthroughs are not live executions. Automated structure checks do not establish that agents will follow the instructions reliably.

## Delivery checks

- Valid Agent Skills frontmatter; name matches directory; description states applicability.
- All bundled reference paths exist and work from the skill directory.
- Root instructions and README expose the skill.
- No external executables, private paths, credentials, internal T3 database dependency or copied third-party policy.
- `git diff --check` passes.

Live T3 launch/handback, startup discovery and cross-machine resumption remain untested unless separately recorded with evidence.
