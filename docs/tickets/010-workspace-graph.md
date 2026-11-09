# 010: Workspace config and Workspace Graph

**Goal:** An Operator can declare Projects and typed Edges, validate them, and see the order and impact Foreman will use.

**Blocked by:** [003: policy/defaults.yaml and Policy Layers](003-policy-layers.md)

**Status:** done

## Acceptance criteria

- [x] **AC-74:** `graph.md` is valid Mermaid and contains every Project and Edge.
- [x] **AC-75 (completes):** invalid `workspace.yaml` errors name the file, key and reason.
- [x] **AC-12 (validation part):** a `depends-on` or `shares-lib` cycle fails validation, and a `calls-api` or event cycle warns.
- [x] `foreman graph` prints the graph, and `foreman graph impact <project>` prints its transitive Downstream.
- [x] Edge direction is normalized in one place, and only confirmed Edges affect order.
- [x] Each Project declares at least one verification command, and `FOREMAN_WORKTREE_<PROJECT>` names don't collide.

## Tests

- Direct: ordering and impact over a small graph, for each Edge type and direction.
- Unconfirmed Edges appear as warnings and don't change order.
- Mermaid output has a stable, byte-identical form for the same input.
