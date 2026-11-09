# Tickets

> **FROZEN — historical plan.** Do not dispatch these tickets as the current backlog. ADR-0067 replaces the standalone-runtime architecture with a Router and independent Worker threads in T3 Code. See [the current direction](t3-native.md). Re-plan before resuming implementation.

These are Foreman v0.1's tickets, broken down from [`docs/spec.md`](spec.md). Each is a vertical slice sized for one implement pass. `AC-N` refers to an acceptance criterion in the spec, "(part)" means another ticket also covers it, and "(completes)" marks the ticket that finishes a split criterion.

## Working rules

- **Order:** a ticket can start once everything in its "Blocked by" is done. Numbers are in dependency order, so working top to bottom is always valid. Tickets whose blockers are done may run in parallel.
- **Safety order:** as the spec requires, the mechanism comes first: the Ledger, then Policy and the Check Engine, then Locks, the Human Channel, and the Outbound Executor, then the Pipeline Engine.
- **No hardcoded behaviour rules:** each ticket reads its rules from Policy. A ticket adding a checkpoint also adds its Safety Default to `policy/defaults.yaml` and classifies its schema leaves (ADR-0051, ADR-0058).
- **Done means:** the ticket's criteria are met, `bun test` and `bun run build` pass, and the work is committed locally in small commits. Never add a remote or push.
- **Vocabulary:** use `GLOSSARY.md`, and respect `docs/decisions.md`. An ADR wins over a ticket if they disagree.

## The owner's required tests

| Test | AC | Ticket |
|---|---|---|
| A repeated error produces a Lesson that's reused on the next Run | AC-56 | 028 |
| The Policy Owner relaxes a default through a confirmed diff, it applies to a new Task, and revert restores it | AC-88 | 025 |
| An in-flight Task keeps its old Policy Snapshot | AC-89 | 025 |
| An agent's or Lesson's attempt to relax is rejected | AC-90, AC-61 | 031, 030 |
| OpenCode's deny rules and scrubbed environment are proven before `enforcesPolicy` can change | AC-4 | 036 |

## Ticket list

### Foundation

| Ticket | Blocked by | ACs |
|---|---|---|
| [001: Project skeleton, CLI seam and build](tickets/001-project-skeleton.md) | - | 82, 84 |
| [002: Ledger](tickets/002-ledger.md) | 001 | 50–51, 55 |

### Policy and Human Channel

| Ticket | Blocked by | ACs |
|---|---|---|
| [003: policy/defaults.yaml and Policy Layers](tickets/003-policy-layers.md) | 001, 002 | 40, 75, 86, 101 |
| [004: Check Engine](tickets/004-check-engine.md) | 003 | 41, 87 |
| [005: Relaxation classification and deviations report](tickets/005-relaxation-classification.md) | 003 | 42, 94–95 |
| [006: Task and Run locks](tickets/006-locks.md) | 002 | 17–20, 55 |
| [007: Local Human Channel](tickets/007-local-human-channel.md) | 001, 002 | 32–33, 85 |
| [008: Accepting Policy Changes](tickets/008-accepting-policy-changes.md) | 002, 005, 007 | 91, 95, 100, 102 |
| [009: Policy history and revert](tickets/009-policy-history-revert.md) | 008 | 93 |

### Workspace, Workers and proof

| Ticket | Blocked by | ACs |
|---|---|---|
| [010: Workspace config and Workspace Graph](tickets/010-workspace-graph.md) | 003 | 12, 74–75 |
| [011: Task worktrees and Integration Branches](tickets/011-worktrees.md) | 004, 010 | 22, 44 |
| [012: Adapter contract, fake Adapter and stubs](tickets/012-adapter-contract.md) | 004 | 1–3 |
| [013: Worker environment and push hook](tickets/013-worker-environment.md) | 004, 011, 012 | 5, 45–47 |
| [014: Verification, Evidence and diff check](tickets/014-verification-evidence.md) | 004, 011, 012, 013 | 6, 24–27, 48 |

### Outbound Actions

| Ticket | Blocked by | ACs |
|---|---|---|
| [015: Approvals and the Outbound Executor](tickets/015-outbound-executor.md) | 002, 004, 007, 011 | 30–31, 34, 38–39, 43 |
| [016: Crash reconciliation for Outbound Actions](tickets/016-outbound-reconciliation.md) | 015 | 52–54 |

### Running work

| Ticket | Blocked by | ACs |
|---|---|---|
| [017: Prompts, locale and Worker context](tickets/017-prompts-context.md) | 003 | 80 |
| [018: Model Assignment and fallbacks](tickets/018-model-assignment.md) | 003, 012 | 76 |
| [019: Starting a Run: Run-level Steps, Inbox and human Gates](tickets/019-run-steps-inbox.md) | 006, 007, 008, 011, 012, 017, 018 | 9, 16 |
| [020: Task execution loop on one Project](tickets/020-task-loop.md) | 006, 013, 014, 019 | 7–9, 23, 28–29, 31 |
| [021: Router and cross-project ordering](tickets/021-router-cross-project.md) | 010, 020 | 10–14 |
| [022: Integration Verification and approving a Run](tickets/022-integration-outbound-set.md) | 015, 021 | 7, 14, 55 |
| [023: Halt, retry, abandon and Task recovery](tickets/023-halt-retry-recovery.md) | 020 | 15, 21 |
| [024: Answered by Router](tickets/024-answered-by-router.md) | 019 | 16 |

### Adaptive Policy in use

| Ticket | Blocked by | ACs |
|---|---|---|
| [025: Hot reload and per-Task Policy Snapshots](tickets/025-hot-reload-snapshots.md) | 009, 015, 020 | 88–89, 103 |
| [026: Natural-language Policy Changes](tickets/026-natural-language-policy.md) | 008, 019 | 92 |

### Learning

| Ticket | Blocked by | ACs |
|---|---|---|
| [027: Lesson store and capture](tickets/027-lesson-store.md) | 002, 020 | 57–59 |
| [028: Lesson retrieval and injection](tickets/028-lesson-injection.md) | 017, 027 | 56, 60 |
| [029: Lesson extraction Step](tickets/029-lesson-extraction.md) | 019, 027 | 66 |
| [030: Change Proposals](tickets/030-change-proposals.md) | 005, 008, 029 | 61–65 |
| [031: Policy authority proofs](tickets/031-policy-authority-proofs.md) | 025, 030 | 41, 90, 96–97 |

### GitHub

| Ticket | Blocked by | ACs |
|---|---|---|
| [032: GitHub Remote](tickets/032-github-remote.md) | 015 | 78 |
| [033: GitHub Approvals](tickets/033-github-approvals.md) | 032 | 35–37 |
| [034: Policy confirmation through a PR](tickets/034-policy-from-pr.md) | 008, 033 | 99 |
| [035: Optional polling](tickets/035-polling.md) | 019, 032 | 79 |

### Adapters and Sandbox

| Ticket | Blocked by | ACs |
|---|---|---|
| [036: OpenCode isolation proof](tickets/036-opencode-proof.md) | 012, 013 | 4 |
| [037: OpenCode reference Adapter](tickets/037-opencode-adapter.md) | 018, 036 | 1, 76 |
| [038: Optional bubblewrap Sandbox](tickets/038-sandbox.md) | 013, 014 | 49 |

### Onboarding

| Ticket | Blocked by | ACs |
|---|---|---|
| [039: Scanner core with JS/TS and Docker](tickets/039-scanner-core.md) | 004, 010 | 67–69 |
| [040: Scanner: other stacks and contracts](tickets/040-scanner-stacks.md) | 039 | 69 |
| [041: `foreman init`: interview and generated Workspace](tickets/041-init-interview.md) | 008, 010, 017, 039 | 70–71, 73, 80, 98 |
| [042: `foreman init`: providers and Model Assignment](tickets/042-init-models.md) | 018, 041 | 105 |
| [043: `foreman init --update`](tickets/043-init-update.md) | 040, 041 | 72, 98 |
| [044: `foreman-init` agent skill](tickets/044-foreman-init-skill.md) | 026, 041, 042, 043 | 98 |

### Deliverables and final gate

| Ticket | Blocked by | ACs |
|---|---|---|
| [045: Example configs and .env.example](tickets/045-example-configs.md) | 010, 027 | 77, 84 |
| [046: README.md](tickets/046-readme-en.md) | 022, 031, 037, 041 | 84 |
| [047: README.pt-BR.md and pt-BR prompts](tickets/047-pt-br-locale.md) | 017, 044, 046 | 80–81 |
| [048: CONTRIBUTING.md](tickets/048-contributing.md) | 012, 037 | 84 |
| [049: Offline, no-telemetry and deliverables gate](tickets/049-quality-gate.md) | 016, 023, 024, 028, 034, 035, 038, 045, 046, 047, 048 | 82–84 |
| [050: Secrets and personal-data scan](tickets/050-repository-scan.md) | 049 | 104 |
