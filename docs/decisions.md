# Architectural decisions

### ADR-0067: T3-native orchestration through independent Worker threads

**Status:** accepted. Supersedes the earlier standalone runtime architecture.

**Decided by:** the owner · **Source:** direct architecture correction and confirmation

Foreman is a set of instructions, policies, documentation and persistent memory used by a Router thread in T3 Code, not a separate application controlling coding agents. Every Worker is an independent T3 Code thread, not a subagent of the Router. T3 Code's native tools create and coordinate those threads and their worktrees.

The Router understands workspace context, documents decisions, maintains persistent memory, dispatches work, follows results and escalates decisions. It does not implement product code, execute engineering tasks itself or substitute its own subagents for Worker threads. Updating its coordination documents and memory is part of its role.

Persistent memory must let a new Router session recover context, decisions, active work, Worker thread links and next actions without relying on chat history alone. Human approval remains distinct from agent messages. Locks, ledger records and human approval are written policy, not runtime enforcement or security boundaries.

The earlier runtime, specification and ticket plan have been removed. Write a replacement specification and plan before new implementation. See [the T3-native direction](t3-native.md). Earlier decisions remain available in Git history, not as current requirements.
