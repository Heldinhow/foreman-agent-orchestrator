# 005: Relaxation classification and deviations report

**Goal:** Foreman can tell whether any Policy change makes things less safe, and can show how a Workspace differs from the Safety Defaults.

**Blocked by:** [003: policy/defaults.yaml and Policy Layers](003-policy-layers.md)

**Status:** done

## Acceptance criteria

- [x] **AC-42:** every Policy schema leaf is classified `safety` or `neutral` in code, and an unclassified path counts as a Relaxation at runtime.
- [x] **AC-94:** classification is correct for each kind of leaf in both directions, for a change introduced by a higher layer, and for moving a value between layers with no change to the result.
- [x] **AC-95 (deviations part):** `foreman policy show --deviations` lists every difference from the Safety Defaults, with its layer.

## Tests

- Table: deny list, allow list, named rule, ordered enum, boolean, number and opaque value, each tightened and relaxed.
- A test walks the schema and fails on any unclassified leaf.
- A Relaxation in the user override is caught through the merged result.
