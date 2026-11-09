# 032: GitHub Remote

**Goal:** Foreman can open and merge PRs on GitHub and GitHub Enterprise through the same interface as the fake Remote.

**Blocked by:** [015: Approvals and the Outbound Executor](015-outbound-executor.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-78:** the GitHub Remote passes its contract suite against a local fake HTTP server, using a configured `apiBaseUrl`.
- [ ] It uses REST with `FOREMAN_GITHUB_TOKEN` from the Workspace's `.env`, and the token never reaches a Worker or the Ledger.
- [ ] Merge refuses if the head differs from the expected SHA.
- [ ] Other hosts are stubs with a clear error.

## Tests

- Contract suite over a local HTTP server, with no real network.
- A token canary checked against Worker environments and Ledger content.
- Error responses: 401, 404, 409 and a rate limit.
