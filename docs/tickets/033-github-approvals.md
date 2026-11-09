# 033: GitHub Approvals

**Goal:** An allowlisted human can approve an action on an existing PR, and a comment posted with Foreman's own token can never pass as human.

**Blocked by:** [032: GitHub Remote](032-github-remote.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-35:** GitHub Approval is refused when the login isn't allowlisted, the account is a `Bot`, the commit doesn't match, or a comment has been edited, and an allowlisted human's correct review passes.
- [ ] **AC-36:** Foreman refuses to start with GitHub Approval enabled when its token identity is on the allowlist.
- [ ] **AC-37:** the Ledger holds the alias and numeric ID, and never the login.
- [ ] It's opt-in, covers only actions on an existing PR, and is checked on `foreman resume`, on `foreman poll` and while supervising.

## Tests

- Fake GitHub server with scripted reviews and comments for each refusal case.
- Sentinel check for a login in the Ledger.
