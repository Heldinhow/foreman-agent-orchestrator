# Assignment and handback protocol

Resolve paths against the workspace/repository specified in the brief, not an assumed Router working directory. Never put secrets or confidential context into public records.

## Worker brief

```text
Task / issue:
Objective and agreed scope:
Delegating Router thread link:
Workspace / project:
Required context files and relevant decisions:
Specification and acceptance criteria:
Dependencies and required base commit/ref:
Allowed changes / forbidden areas:
Provider/model and permission constraints:
Verification required (commands/behavior, where agreed):
Push/PR authorization scope (or explicitly none):
Stop/escalation conditions:

Return protocol:
Report completion, failure or blockage to the delegating Router above using
available T3 thread communication, preferably noninterrupting queue delivery.
Include the report fields below. Check delivery; queued is not acknowledged.
If delivery fails, retain a report in the agreed safe location, mark handback
pending and do not assume the Router knows the result.
Fallback report location / confidentiality constraints:
```

If the launch operation does not yet expose the new Worker's identity, the Router records that link after launch; do not fabricate it in the initial brief.

## Durable assignment record

```text
Task / issue:
Scope:
Delegating Router link:
Worker thread link:
Project / branch / sanitized worktree reference:
State: planned | assigned | working | blocked | handback-pending |
       awaiting-verification | awaiting-human | done | cancelled
Last observed state and evidence source:
Latest result / commit / PR:
Checks actually reported and evidence references:
Unmet acceptance criteria / blockers:
Next action and responsible party:
Last update (timestamp):
```

These are coordination labels, not guaranteed T3 runtime enum values. `cancelled` requires evidence that execution stopped; a cancellation request alone is insufficient. `done` requires the issue's acceptance criteria and required verification/approvals, not just a successful send or commit.

## Worker return

```text
Task / issue and Worker thread link:
Outcome: completed | partial | blocked | failed
Changes and scope:
Branch / commit / PR:
Verification actually performed and result:
Evidence references:
Unmet criteria and blockers:
Decisions made, authority and context learned:
Uncommitted work / still-running operations:
Recommended next action:
Handback delivery state:
```

The Router records receipt and the next action durably. A Worker may propose a decision; it must not attribute approval to a human without evidence. Never copy raw tool logs containing credentials or personal paths into public memory.
