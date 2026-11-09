# Foreman

T3-native coordination for AI engineering work: a Router with durable context and independent Worker threads, under human control.

## Current status

**Architecture migration; not a completed product.** The owner replaced the earlier standalone TypeScript runtime design with instructions, policies and persistent memory used inside T3 Code. The existing `src/`, tests and old tickets describe the superseded implementation, not a working T3-native orchestrator.

Start with [AGENTS.md](AGENTS.md), [the current direction](docs/t3-native.md) and [ADR-0067](docs/decisions.md). The old spec and backlog are frozen until rewritten.

## How it works

- The **Router** understands workspace context, documents decisions, maintains memory, assigns work and follows results.
- **Workers** are independent T3 Code threads, not Router subagents. They perform engineering work with isolated worktrees where appropriate.
- Each Worker returns evidence, blockers and context changes to the delegating Router. The Router updates the durable records.
- The process is: agree with docs → spec → GitHub tickets → implementation → verification/review → PR.
- Human approval is distinct from agent messages. Instructions alone are not enforced security controls.

## Persistent context

- [`orchestrator/context.md`](orchestrator/context.md): durable workspace context.
- [`orchestrator/decisions.md`](orchestrator/decisions.md): decision index and coordination decisions.
- [`orchestrator/status.md`](orchestrator/status.md): implementation status, assignments, evidence and next actions.

Keep these records sanitized: this is a public repository. Do not commit credentials or confidential workspace information.

## Clone and resume on another computer

Once the documentation PR is merged:

```sh
git clone https://github.com/Heldinhow/foreman-agent-orchestrator.git
cd foreman-agent-orchestrator
```

Before merge, review the documentation branch with:

```sh
git clone --branch docs/t3-native-orchestration https://github.com/Heldinhow/foreman-agent-orchestrator.git
cd foreman-agent-orchestrator
```

Open this repository in T3 Code. Have the new Router read `AGENTS.md` and the three orchestrator records before assigning work. Authenticate T3/GitHub separately as needed; check current issues/PRs and whether recorded Worker threads remain accessible. Reconcile status before creating replacement Workers.

Cloning transfers committed instructions and memory only. It does **not** transfer credentials, conversation history, uncommitted work, local worktrees or running processes. This repository does not yet provide automated cross-machine thread recovery.

## License

MIT — see [LICENSE](LICENSE).
