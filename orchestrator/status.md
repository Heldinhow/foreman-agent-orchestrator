# Coordination and implementation status

This is a recovery index, not proof of current live state. Verify linked records before resuming.

## Current work

| Work | State | Evidence / next action |
| --- | --- | --- |
| T3-native instructions, coordination, setup and continuity | Merged; static validation only | [PR #2](https://github.com/Heldinhow/foreman-agent-orchestrator/pull/2) merged. Live onboarding, Worker handback, routing and recovery remain untested. |
| T3-only repository cleanup | In progress on `chore/t3-only-cleanup` | Owner explicitly assigned this thread as Worker, authorized branch push and PR creation, and prohibited merge. Review the resulting PR. |
| Replacement T3-native specification | Not started | Agree with the revised docs, then create the spec issue. |
| Replacement implementation tickets | Blocked on replacement spec | Plan new work against the T3-native direction. |

## Assignment record template

For each future task record: issue; scope; delegating Router link; Worker thread link; project; branch/worktree reference (sanitized); state; latest verified outcome; checks/evidence; blockers; next action; last update. Link the PR when created. Record a failed handback explicitly.
