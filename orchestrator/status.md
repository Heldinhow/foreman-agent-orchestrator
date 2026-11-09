# Coordination and implementation status

This is a recovery index, not proof of current runtime state. Verify linked records before resuming. No Worker is assigned by this document.

## Current work

| Work | State | Responsible thread | Evidence / next action |
| --- | --- | --- | --- |
| T3-native instructions and memory documentation | Proposed; awaiting PR review | Current coordination conversation; no Worker assigned | [Issue #1](https://github.com/Heldinhow/foreman-agent-orchestrator/issues/1), [PR #2](https://github.com/Heldinhow/foreman-agent-orchestrator/pull/2). Documentation only. |
| T3 coordination skill | Documented; static validation only, awaiting PR review | Current coordination conversation; no Worker assigned | [Issue #3](https://github.com/Heldinhow/foreman-agent-orchestrator/issues/3), delivered in PR #2. Native execution/handback and cross-machine recovery remain untested. |
| Grill question routing | Documented; static review only, awaiting PR review | Current coordination conversation; no Worker assigned | [Issue #4](https://github.com/Heldinhow/foreman-agent-orchestrator/issues/4), PR #2. Live Worker → Router → human → Worker round trip remains untested. |
| AI Hero skill authoring review | Refactored; static checks only, awaiting PR review | Current coordination conversation; no Worker assigned | [Issue #5](https://github.com/Heldinhow/foreman-agent-orchestrator/issues/5), PR #2. Conditional references and completion criteria added; live behavioral evaluation remains pending. |
| Context-first setup skill | Documented; static checks passed, awaiting PR review | Current coordination conversation; no research Worker assigned | [Issue #6](https://github.com/Heldinhow/foreman-agent-orchestrator/issues/6), PR #2. Defines interview, research and memory contract; actual workspace onboarding and live validation are not performed. |
| Replacement T3-native specification | Not started | Unassigned | Agree with the revised docs, then create the spec issue. |
| Replacement implementation tickets | Blocked on replacement spec | Unassigned | Do not reuse the old backlog without re-planning. |

## Historical runtime work — frozen

- Landed under the old design: tickets 001–007 and 010–013; integration commit `143b32c`. Last recorded integration check: 1002 tests passed, typecheck/build passed. This is historical evidence, not a verification of the new architecture.
- Ticket 008: partial/broken, not landed; branch `t3/accepting-policy-changes-1`, last recorded commit `a3651f5`; 933 tests passed and 72 failed. Typecheck/build passed. Do not resume under the new design without a migration decision.
- Ticket 014: partial, not landed; branch `t3/9035daca`, last recorded commit `37a6787`. Only committed diff path checks were implemented. Subsequent completion work was requested to cancel; verify local state before reuse.
- Ticket 013: landed but relaxation confirmation criteria remain dependent on unfinished 008.
- Previous delegated tasks were stopped for handoff. Their current state has not been re-verified here; do not treat them as active T3-native Worker assignments.

Historical branches/worktrees may exist only on the original computer. They are not part of a fresh clone unless explicitly published. Never infer that missing local work was completed.

## Assignment record template

For each future task record: issue; scope; delegating Router link; Worker thread link; project; branch/worktree reference (sanitized); state; latest verified outcome; checks/evidence; blockers; next action; last update. Link the PR when created. Record a failed handback explicitly.
