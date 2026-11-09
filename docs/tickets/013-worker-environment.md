# 013: Worker environment and push hook

**Goal:** A Worker gets only what Policy allows. No secret from the supervisor's environment reaches it, and its accidental `git push` is blocked.

**Blocked by:** [004: Check Engine](004-check-engine.md), [011: Task worktrees and Integration Branches](011-worktrees.md), [012: Adapter contract, fake Adapter and stubs](012-adapter-contract.md)

**Status:** in-progress

## Acceptance criteria

- [x] **AC-5:** a Worker receives exactly the built environment, and a canary in the supervisor's environment isn't visible.
- [x] Per ADR-0064, the `foreman` command doesn't load `.env` or `bunfig.toml` from the current directory: a real-process test runs the built CLI from a directory holding a planted `bunfig.toml` preload and a `.env` canary, and shows that neither took effect. The Bun version and the command's launcher behaviour are the proof, so don't only assert on flags.
- [ ] **AC-45:** a `.env.example` remains available, and `.env` stays denied until a confirmed Relaxation changes it.
- [ ] **AC-46:** a refused credential name in `env.passthrough` isn't passed, and a file edit adding one has no effect until confirmed.
- [x] **AC-47:** a Worker's `git push` is blocked by the injected hook, with no change to the repository's config.
- [x] `FOREMAN_WORKER`, `FOREMAN_RUN_ID` and `FOREMAN_TASK_ID` are always set and can't be removed by Policy.
- [x] Other Project hooks are chained, and allowlists and never-pass names come from `policy/defaults.yaml`.

## Tests

- Real child process prints its environment, asserted against canaries.
- Real git: a push from the Worker's environment to the bare repository fails, and the repository config is unchanged.
- A project pre-commit hook still runs.
