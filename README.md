# Foreman

**Requires T3 Code.** Foreman coordinates AI engineering work through a Router, durable context and independent Worker threads, under human control.

**Safety boundary:** locks, ledger records and human approval are written policy—instructions the agent follows—not runtime enforcement. They do not provide a security boundary or guarantee exclusive access, durable logging or authenticated approval.

## Current status

**Instructions and memory; not a completed product.** Foreman has no standalone runtime, test suite or CI. Live T3 coordination and recovery remain to be validated.

Start with [AGENTS.md](AGENTS.md), [the current direction](docs/t3-native.md) and [ADR-0067](docs/decisions.md). A replacement specification is not yet written.

## How it works

- The **Router** understands workspace context, documents decisions, maintains memory, assigns work and follows results.
- **Workers** are independent T3 Code threads, not Router subagents. They perform engineering work with isolated worktrees where appropriate.
- Each Worker returns evidence, blockers and context changes to the delegating Router. The Router updates the durable records.
- The process is: agree with docs → spec → GitHub tickets → implementation → verification/review → PR.
- Human approval is distinct from agent messages. Instructions alone are not enforced security controls.

## Setup skill

Load [`foreman-setup`](.agents/skills/foreman-setup/SKILL.md) to initialize or refresh a workspace. It interviews the operator about the product, registers target/reference repositories, routes read-only research to independent T3 Workers and defines where sourced knowledge and open gaps are stored. Setup ends with explicit confirmation of the understood scope, not a promise of complete knowledge.

The memory contract defines a workspace catalog with repository responsibilities and T3 binding references, a context index, per-project notes, dependencies, evidence and setup progress alongside decisions/status. Discussion history and session handoff preserve consequential context between conversations. Confirm a private destination for confidential workspace findings; this public repository is not their default home. The skill is instructions, not an implemented `foreman init` CLI. Live onboarding remains untested.

## Coordination skill

The repository includes [`foreman-t3-coordination`](.agents/skills/foreman-t3-coordination/SKILL.md): native thread/worktree coordination, self-contained briefs, Worker handbacks, durable status and session recovery. It has no external scripts or skill dependencies.

If T3 Code does not automatically discover `.agents/skills/`, explicitly load the linked `SKILL.md`. Live T3 handback and cross-machine recovery have not yet been integration-tested; see the bundled acceptance scenarios.

## Persistent context

- [`orchestrator/context.md`](orchestrator/context.md): durable workspace context.
- [`orchestrator/decisions.md`](orchestrator/decisions.md): decision index and coordination decisions.
- [`orchestrator/status.md`](orchestrator/status.md): implementation status, assignments, evidence and next actions.

Keep these records sanitized: this is a public repository. Do not commit credentials or confidential workspace information.

## Clone and resume on another computer

```sh
git clone https://github.com/Heldinhow/foreman-agent-orchestrator.git
cd foreman-agent-orchestrator
```

Open this repository in T3 Code. Have the new Router read `AGENTS.md` and complete the linked cold-session bootstrap before assigning work. It reads the core memory and every registered project summary, then routes each demand through documented responsibilities/dependencies to a verified T3 project. Missing workspace records are setup gaps, not an initialized catalog. Authenticate T3/GitHub separately as needed; check current issues/PRs and whether recorded Worker threads remain accessible. Reconcile status before creating replacement Workers.

Cloning transfers committed instructions and memory only. It does **not** transfer credentials, conversation history, uncommitted work, local worktrees or running processes. This repository does not yet provide automated cross-machine thread recovery.

## License

MIT — see [LICENSE](LICENSE).
