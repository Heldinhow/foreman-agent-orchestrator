# 041: `foreman init`: interview and generated Workspace

**Goal:** A new user can go from a clone to a valid Workspace by answering one question at a time, with no model configured.

**Blocked by:** [008: Accepting Policy Changes](008-accepting-policy-changes.md), [010: Workspace config and Workspace Graph](010-workspace-graph.md), [017: Prompts, locale and Worker context](017-prompts-context.md), [039: Scanner core with JS/TS and Docker](039-scanner-core.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-70:** the scripted interview works with no model and no Adapter configured.
- [ ] **AC-71:** `--from` with the same answers gives byte-identical output on repeated runs.
- [ ] **AC-73:** an interrupted interview resumes from its draft.
- [ ] **AC-98 (part):** `foreman init` records the first snapshot. Relaxing answers through `--from` or `--yes` fail without a Human Channel, naming the keys. A TTY confirmation applies them.
- [ ] **AC-80 (interview part):** with pt-BR selected, the interview text is in pt-BR.
- [ ] It collects domain context, goals, scope, constraints, conventions, policies and confirmed Edges, and writes the Workspace layout.
- [ ] Git URLs are cloned only after consent.

## Tests

- App seam with scripted terminal input.
- Stop mid-interview, then resume from the draft.
- Run `--from` twice and compare the bytes.
- Then run `foreman validate` on the output.
