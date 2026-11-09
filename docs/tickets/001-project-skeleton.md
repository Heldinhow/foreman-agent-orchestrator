# 001: Project skeleton, CLI seam and build

**Goal:** A contributor can clone the repository, run the tests and build it, and `foreman --version` works from both source and the built output. Every later ticket gets the test seam it needs.

**Blocked by:** None (can start immediately)

**Status:** done

## Acceptance criteria

- [x] **AC-82 (part):** `bun test`, `bun run typecheck` and `bun run build` pass with no network, and the built `dist/` entry passes a smoke test.
- [x] `createApp(deps).exec(argv)` is the single command entry, with injected clock and terminal I/O, and the shipped entry point wires real dependencies with no switch.
- [x] Exit codes are defined as in the spec: `0`, `1`, `2`, `3`, `4`.
- [x] Test helpers create temp directories, real temp git repositories and a local bare repository.
- [x] **AC-84 (part):** `LICENSE` is MIT with copyright "Foreman contributors", and `.gitignore` covers real config paths, `memory/`, `.env` and `dist/`.

## Tests

- App seam: `--version`, an unknown command returns exit code `2`.
- Real process: the built entry runs and prints the version.
- Helpers: a temp repository can commit and push to the bare repository.
