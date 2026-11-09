# 003: policy/defaults.yaml and Policy Layers

**Goal:** Foreman's behaviour comes from a shipped defaults file plus Workspace, Project and user layers, and `foreman validate` and `foreman policy show` explain the result. This ticket creates the `policy/defaults.yaml` deliverable, and later tickets add their rules to it.

**Blocked by:** [001: Project skeleton, CLI seam and build](001-project-skeleton.md), [002: Ledger](002-ledger.md)

**Status:** done

## Acceptance criteria

- [x] **AC-86:** precedence is built-in < Workspace < Project < user override, named rules merge by ID, and `foreman policy show --explain <key>` names the layer.
- [x] **AC-40:** the shipped file holds Propose Mode, Approval before push, PR, merge and deploy, the `.env` deny, Evidence to close a Task, and agent messages not counting.
- [x] **AC-101:** a policy file inside a Project's repository is ignored, even in the correct format.
- [x] **AC-75 (Policy part):** unknown keys, bad references and wrong types each name the file, key and reason.
- [x] Commands find the Workspace from `--dir`, then `FOREMAN_WORKSPACE`, then the nearest ancestor.
- [x] The user override is read from `$XDG_CONFIG_HOME` or `~/.config`, and tests use a temp directory rather than the real home.

## Tests

- App seam: each layer overriding the one below, for a map, a named rule and a plain list.
- Invalid files: one case each for an unknown key, a wrong type and a bad reference.
- A correctly formatted policy file planted in a Project is ignored.
