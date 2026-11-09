# 023: Halt, retry, abandon and Task recovery

**Goal:** A failed or crashed Run never loses work, and the Operator can decide what happens next.

**Blocked by:** [020: Task execution loop on one Project](020-task-loop.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-15:** a failed Task halts the Run and keeps its branches, and `foreman retry` and `foreman abandon` both work.
- [ ] **AC-21:** after recovery, commits remain on the branch, uncommitted changes are in a saved patch, and the new Worker continues from the branch.
- [ ] A Worker with a resumable session continues through `send`, and any other is cancelled before the Task is reassigned.
- [ ] Worktrees are removed once a Run is `completed` or `abandoned`, and branches remain.

## Tests

- Real process: `SIGKILL` the supervisor mid-Task, wait out the TTL with short values, then resume.
- A fake Adapter with and without resumable sessions.
- Retry and abandon on a halted Run.
