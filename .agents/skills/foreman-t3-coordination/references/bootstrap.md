# Cold-session bootstrap

Run before coordinating work in a new Router session, including a new conversation on the same machine. Persisted records, not presumed conversational memory, restore the workspace. For another machine also apply `recovery.md`.

## 1. Resolve the record set

Locate the operator-confirmed workspace memory root and privacy boundary. Read the local instructions and context index there. Follow safe private-store references only with authorized access. If the workspace or its records cannot be identified, ask rather than treating a fresh clone as an initialized workspace.

**Done:** the current workspace is unambiguous, and missing/inaccessible records are listed.

## 2. Rehydrate the core

Read the complete current core: context, workspace catalog, every registered project summary, dependency records, current decisions, coordination status, setup gaps, knowledge index and latest handoff. Their path contract lives in the setup skill's [memory reference](../../foreman-setup/references/memory.md). Read the discussion-history index through the latest entry; follow owning records for corrections, unresolved questions and task-relevant detail.

Detailed reports may be retrieved on demand through the index, but every source and relevant durable conclusion must be discoverable. Record what was read, inaccessible or stale. If required material is too large or truncated, finish reading it or explicitly record the missing coverage and request/prepare sourced summaries before dependent work. Context-window limits are not permission to silently omit decisions or projects.

**Done:** all registered repositories can be identified with their responsibilities and relationships, current constraints and unfinished work are recovered, and any missing coverage is explicit. Only unaffected work may proceed while required context is unavailable.

## 3. Reconcile live state

Use `recovery.md` to check accessible Worker threads, issues and PRs. Validate project/environment mappings needed for the next demand. A historical handoff is not evidence that a Worker is still running or has stopped.

**Done:** every active/pending assignment has a verified observation or a named access blocker; no replacement is based merely on session restart.

## 4. Record the resumed checkpoint

Update the handoff record with bootstrap coverage, discrepancies and next actions. For the next demand, use `routing.md` to retrieve detailed evidence and bind work to the correct project. Material new discussion updates the owning record and history as it happens, not just at logout.

**Done:** the new session can explain product scope, repository responsibilities, current work and uncertainty from persistent sources. Do not claim the host automatically injected these records or that all future knowledge is already known.
