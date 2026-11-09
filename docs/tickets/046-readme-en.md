# 046: README.md

**Goal:** A new user can evaluate Foreman, get started and accurately understand its limits.

**Blocked by:** [022: Integration Verification and approving a Run](022-integration-outbound-set.md), [031: Policy authority proofs](031-policy-authority-proofs.md), [037: OpenCode reference Adapter](037-opencode-adapter.md), [041: `foreman init`: interview and generated Workspace](041-init-interview.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-84 (part):** `README.md` has the pitch, quickstart, architecture, safety model and roadmap.
- [ ] Each quickstart command has been run against the built CLI with the fixture setup.
- [ ] The safety model lists each Safety Default, how to relax it, and what relaxing it risks. It states every limit required by the spec, including that Foreman is safe by default, not by guarantee.
- [ ] It records the OpenCode proof's actual result from ticket 036, and doesn't claim more than was proven.
- [ ] The v0.2 roadmap lists the dashboard, cost and difficulty routing, budgets, and an organization policy layer (enforced minimums).
- [ ] The corporate-use limit is stated and points to that roadmap item.
- [ ] VPS use is documented with tmux and systemd examples.

## Tests

- A test confirms that each `foreman` command in the README exists in the CLI.
- A test confirms that the required sections and roadmap items are present.
