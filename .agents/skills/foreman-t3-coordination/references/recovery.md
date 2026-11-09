# Recovery and handoff

## Pending handback

The Worker sends completion, partial progress, blockage or failure to the delegating Router using the return fields in `protocol.md`. If delivery fails, preserve a report at the agreed safe location and mark handback pending. Public GitHub records are suitable only for public-safe content.

On resumption, the Router reconciles pending reports through accessible threads and records. A top-level thread is not assumed to wake the Router automatically. This protocol provides resumability, not an unattended recovery service.

**Done:** the Router has reconciled the report, or delivery/access remains explicitly pending with a responsible party and next action.

## Uncertain execution

Check recorded Worker links, issue/PR state and available thread activity before replacing work. An inaccessible thread or a timeout does not establish failure. Distinguish a requested cancellation from a confirmed stop.

**Done:** existing work is located and reconciled, or blocked on a specific missing fact. Replacement requires resolving duplication risk, not merely opening another conversation.

## End a session

Update each unfinished assignment/question with its latest observation, evidence references, blockers, owner and next action. Use the setup memory contract's handoff shape to record the latest memory coverage and unsynchronized changes. Keep committed records sanitized under the repository confidentiality rules.

**Done:** a fresh Router can identify all unfinished work and the next actions from the durable index; the checkpoint links to captured material discussions and flags anything not saved. The next session runs `bootstrap.md`, even on the same machine.

## Another computer

Clone committed instructions and records; authenticate separately. Verify issue/PR state, thread environment accessibility and any machine-local branch/worktree references before resuming. Git transfers committed records, not conversations, credentials, running processes, local worktrees or uncommitted changes.

**Done:** each ongoing assignment is reconciled with accessible execution or marked awaiting access; unresolved original-machine work is not duplicated. Automatic cross-machine thread migration is outside this skill.
