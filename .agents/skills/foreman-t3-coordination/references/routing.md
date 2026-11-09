# Route a demand to repositories

Read the workspace catalog, relevant project notes, current decisions and dependency records before selecting a Worker project. Their paths and ownership are defined in the setup skill's [memory contract](../../foreman-setup/references/memory.md).

## Identify responsibility

Map the requested outcome to documented capabilities, domain ownership and interfaces, not just repository names or keywords. A workspace may contain seven related services or another number; cover the actual catalog rather than assuming one repository per demand.

For each candidate distinguish:

- direct implementation owner;
- affected upstream/downstream project or shared contract;
- read-only reference that can inform work but cannot receive changes under this scope;
- project requiring only verification or no action.

If responsibility is ambiguous, inspect known evidence or assign bounded read-only research; ask the human when the missing fact is intent or authority. Keep the affected assignment blocked rather than choosing arbitrarily.

## Check cross-project impact

Follow relevant dependency and information flows. Record contract-first/upstream ordering, downstream adaptations and integration verification where required. Preserve cycles and uncertain edges instead of manufacturing an execution order. Split multi-project work into appropriately scoped independent Worker threads rather than binding a single thread to the wrong repository.

## Resolve actual binding

Check the selected catalog entry against accessible T3 project/environment information and the required repository/base. Use tool discovery for the installed lookup/launch operations. Treat a missing, stale or conflicting mapping as a blocker; local directory guesses are not valid binding evidence. Another machine may require a different local mapping for the same stable repository identity.

**Done:** the assignment records selected project IDs/references, routing rationale, context/evidence read, impacted projects, scope/dependency order and a verified binding (or explicit blocker). Add these to the brief before launching. Routing is not permission to change a project or publish work.
