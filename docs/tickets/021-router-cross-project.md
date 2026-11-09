# 021: Router and cross-project ordering

**Goal:** An Intent spanning several Projects becomes Tasks assigned by Role and Project, and they run in Workspace Graph order. This ticket adds the fake four-service fixture Workspace.

**Blocked by:** [010: Workspace config and Workspace Graph](010-workspace-graph.md), [020: Task execution loop on one Project](020-task-loop.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-10:** invalid `routing` output gets one corrective message, then halts the Run, and a Role assigned to a Project it isn't allowed on is refused.
- [ ] **AC-11:** Upstream Tasks complete first for `shares-lib` and `depends-on`, and the contract Task goes first for `calls-api` and events.
- [ ] **AC-12 (completes):** a `calls-api` cycle pauses for the Operator.
- [ ] **AC-13:** a multi-Project Run with no integration command halts before any `implement` Worker starts.
- [ ] **AC-14:** a Downstream Worker receives the `FOREMAN_WORKTREE_<PROJECT>` of its verified Upstream.
- [ ] A `contract: true` Task with a direct Downstream that has no Task raises a notice before implementation.

## Tests

- Fixture Workspace: `shared-types`, `catalog-api`, `orders-api` and `notifier`, with shell-script verify commands.
- Recording start order across the Run for each Edge type.
- Each bad routing output.
