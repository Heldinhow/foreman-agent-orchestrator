# 035: Optional polling

**Goal:** An Operator who opts in sees remote activity in the Inbox, and polling can never cause anything to happen by itself.

**Blocked by:** [019: Starting a Run: Run-level Steps, Inbox and human Gates](019-run-steps-inbox.md), [032: GitHub Remote](032-github-remote.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-79:** polling is off by default. With it on, events deduplicate across repeated polls, text from unknown authors is withheld, and no event causes an Outbound Action or starts a Run.
- [ ] `foreman poll` does one read, and supervising polls at `intervalSeconds`.
- [ ] Allowlisted text is shown to the Operator and never injected into Workers.
- [ ] Bot comments are only counted.

## Tests

- Fake GitHub server with repeated polls.
- A malicious comment from an unknown author, checked against Inbox bodies and Worker context.
- A recording fake Remote confirms that no write calls happen.
