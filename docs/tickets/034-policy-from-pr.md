# 034: Policy confirmation through a PR

**Goal:** A Policy Owner who versions `foreman/` on GitHub can confirm a Policy Change by reviewing a PR.

**Blocked by:** [008: Accepting Policy Changes](008-accepting-policy-changes.md), [033: GitHub Approvals](033-github-approvals.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-99:** `--from-pr` applies only with an `APPROVED` review at the checkout's clean `HEAD` from a `policyOwner: true` account of type `User`. An allowlisted reviewer without the mark, a `Bot`, a different commit and a dirty checkout are each refused.

## Tests

- Fake GitHub server and a real temp Workspace repository, one scenario per refusal.
- Successful apply records channel, alias and hashes.
