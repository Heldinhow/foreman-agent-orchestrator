# 011: Task worktrees and Integration Branches

**Goal:** Each Task gets an isolated worktree that contains no secrets, and verified work combines on a local Integration Branch.

**Blocked by:** [004: Check Engine](004-check-engine.md), [010: Workspace config and Workspace Graph](010-workspace-graph.md)

**Status:** done

## Acceptance criteria

- [x] **AC-22:** parallel Tasks in one repository use separate worktrees, and their work combines on the Integration Branch.
- [x] **AC-44:** a worktree contains no untracked `.env`. A `copyFiles` entry matching the deny list is refused, and a tracked denied file blocks the Task with a clear reason.
- [x] Branches are named `foreman/<runId>/task-<taskId>` and `foreman/<runId>/integration`.
- [x] Capture commits a Worker's uncommitted changes, excluding ignored files.
- [x] A merge conflict is reported as data that can become the next instruction.
- [x] Read-only views are detached at `baseRef`, and modifications to them can be detected with git.

## Tests

- Real git: create, capture, merge, conflict and clean up.
- Real git: a planted `.env` in the source checkout doesn't reach the worktree.
- All decisions come through the Check Engine, verified by changing a rule.
