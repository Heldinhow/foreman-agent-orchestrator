# Thread operations

Current host instructions and installed tool definitions govern availability and parameter semantics. Discover definitions before calling; the names below are lookup hints, not a cached schema.

## Launch and workspace

Use native independent-thread launch, commonly `t3_thread_launch`. Honor operator model/provider choices and permission ceilings. If a required choice is unavailable, escalate instead of silently substituting it.

Bind the workspace at launch. For isolated repository changes use the tool's worktree strategy; a shell-created worktree does not bind a T3 thread. Honor an explicit base and host default-base rules. Required unpublished dependencies must exist in that base; uncommitted changes are not copied into a new worktree.

When supported, retain a client request ID for retries of the same launch. If delivery is ambiguous, reconcile that request/thread before creating another assignment. A launch that succeeds before record-writing fails is an existing Worker to recover, not a reason to launch again.

## Read and send

Find/read threads using discovered tools, commonly `t3_thread_search` and `t3_thread_read`. Read the target before answering about its work. Use activity evidence when message-only results omit relevant operations.

For sends, commonly `t3_thread_send`, choose an explicit supported mode after checking idle/running behavior:

- **Queue:** ordinary follow-ups and nonurgent handbacks.
- **Steer:** intentional immediate correction; may affect in-flight operations.
- **Restart:** authorized restart, accounting for interrupted work and cancelled activity.

An automatic mode can steer a running thread; choose it only when that behavior is intended. Preserve request IDs on retries of the same send. Record actual delivery status: queued, started, steered or restarted is not acknowledged, verified or completed.

For an independent-thread stop, discover the appropriate interrupt tool and record request versus confirmed stop separately. Preserve its branch/worktree and uncommitted work. Cleanup is a separate authorized operation after state verification.

## Observation

Use the host-supported event and observation mechanisms. Respect any no-polling and lifecycle instructions; do not add sleeps, watchers or schedules to bypass them. Independent threads have no assumed automatic completion callback: use the handback in `protocol.md`.
