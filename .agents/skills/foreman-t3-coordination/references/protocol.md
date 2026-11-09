# Coordination records

Use these fields for briefs, durable assignments, questions and returns. Resolve project paths against the workspace named in the brief.

## Worker brief

```text
Task / issue:
Objective and scope:
Delegating Router thread link:
Workspace / project:
Required context and relevant decisions:
Specification / acceptance criteria:
Dependencies / required base commit or ref:
Allowed changes / forbidden areas:
Provider/model / permission constraints:
Verification required:
Push/PR authorization scope (or none):
Stop / escalation conditions:
Return destination: delegating Router above
Fallback report location / confidentiality constraints:
```

For a grill assignment, include the procedure in `grill.md`. For every assignment, include the handback procedure in `recovery.md` and the return fields below in the self-contained brief. The Worker cannot rely on unprovided Router history.

## Durable assignment

```text
Task / issue / scope:
Delegating Router link / Worker thread link:
Project / branch / sanitized worktree reference:
State:
Last observation / evidence source:
Latest outcome / commit / PR:
Checks reported / evidence references:
Unmet criteria / blockers:
Next action / responsible party:
Last update (timestamp):
```

### Coordination states

These labels are not T3 runtime enum values:

- `planned`: scope recorded, no launch confirmed.
- `assigned`: Worker launch confirmed.
- `working`: activity observed, outcome pending.
- `blocked`: a named missing decision/capability prevents dependent work.
- `handback-pending`: report exists, return delivery or receipt unresolved.
- `awaiting-verification`: reported outcome needs engineering evidence.
- `awaiting-human`: a decision or gated authorization is pending.
- `done`: the issue's criteria, verification and required approvals are satisfied.
- `cancelled`: execution is confirmed stopped; record retained work separately.

## Grill question / answer

```text
Issue / Worker thread / delegating Router:
Question ID / question / context:
Recommended answer / rationale (if applicable):
Dependent decision:
State: awaiting-router | awaiting-human | answered | delivery-pending
Answer / source reference or explicit human response:
Worker notification / delivery evidence:
Grill document updates:
```

## Worker return

```text
Task / issue / Worker link:
Outcome: completed | partial | blocked | failed
Changes / scope:
Branch / commit / PR:
Checks actually performed / results / evidence references:
Unmet criteria / blockers:
Decisions / authority / context learned:
Uncommitted work / still-running operations:
Recommended next action:
Handback delivery state:
```
