# 050: Secrets and personal-data scan

**Goal:** Before anyone publishes this repository, `bun run scan` proves it holds no secrets or personal data, enforcing ADR-0003. This is the final ticket.

**Blocked by:** [049: Offline, no-telemetry and deliverables gate](049-quality-gate.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-104:** `bun run scan` fails on a planted instance of each rule, masks the matched value, doesn't match ordinary words such as "task-based", honours the allow file and the local denylist, and passes on this repository. `--history` finds a value that only exists in a past commit.
- [ ] Token rules cover GitHub (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), `sk-` style keys, Slack `xox` tokens, AWS `AKIA` keys and private key headers.
- [ ] Other rules cover personal home paths, internal-looking hostnames, private IP addresses, this machine's `hostname`, `$USER` and git `user.name`, and names from the local denylist.
- [ ] The denylist file is gitignored, and the repository ships no personal names, paths or hostnames.
- [ ] Per ADR-0061, the scan including `--history` explicitly allows exactly the project's commit author email (read from this repository's git config at setup and committed to the allow config) and any intentional placeholder repository URL. It flags every other author identity and URL, and a near-match of the allowed email is flagged.
- [ ] The result is reported honestly: any real finding in the repository or its history is fixed or brought to the owner, and is never silently allowlisted.

## Tests

- Temp git repositories with each rule planted, using strings built at run time so the repository stays clean.
- False-positive cases, including "task-based" and documented placeholders.
- A test of the allow file requiring a reason.
- A test that a reported value is masked.
- `bun run scan` on this repository as part of the gate.
