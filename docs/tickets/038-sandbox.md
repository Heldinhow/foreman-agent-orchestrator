# 038: Optional bubblewrap Sandbox

**Goal:** An Operator on Linux can raise protection for Workers and verification commands with one Policy setting.

**Blocked by:** [013: Worker environment and push hook](013-worker-environment.md), [014: Verification, Evidence and diff check](014-verification-evidence.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-49:** a sandboxed Worker can't read `.env`, `memory/` or a canary in `HOME`, and can write and commit in its worktree. When bubblewrap isn't available, `sandbox: bwrap` fails validation.
- [ ] The project's git config and hooks are mounted read-only, and an Adapter can declare read-only paths it needs.
- [ ] Verification commands run in the same Sandbox.
- [ ] The network stays available.

## Tests

- Real bubblewrap, skipped with a visible reason if unavailable.
- A sandboxed Worker tries to edit the git config and fails.
- Validation with bubblewrap removed from `PATH`.
