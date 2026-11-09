# Decisions

This is the architecture decision record for Foreman v0.1. Terms are defined in [`GLOSSARY.md`](../GLOSSARY.md).

**Provenance.** Each entry says who decided it and where it came from:

- **the owner**: decided by the owner. The owner was not live during the design interview (the grill), so an orchestrating agent relayed the answers to grill Q1–Q14 and round 2 on the owner's behalf, based on the owner's recorded decisions.
- **delegated engineering**: a pure engineering choice made by the grill author under the owner's instruction to decide such points and record them. These are the easiest entries to revisit.

**Source labels.** `brief N` is an item in the owner's project brief. `workspace`, `setup` and `init` are the owner's additional decisions of 2026-11-09. `Qn` and `round 2` are from the grill.

**Unverified assumptions** are marked as such and each names what must confirm it.

## A. Product and scope

### ADR-0001: Name and license

**Decided by:** the owner · **Source:** brief 1, brief 10

The project is named Foreman and is licensed under MIT, with copyright held by "Foreman contributors".

### ADR-0002: English by default, pt-BR optional

**Decided by:** the owner · **Source:** brief 2

English is the default language. pt-BR is an optional locale for prompts and docs (`README.pt-BR.md` and `prompts/pt-BR/`). A prompt missing from a locale falls back to English (delegated engineering).

### ADR-0003: Generic, work-ready, no telemetry

**Decided by:** the owner · **Source:** brief 3

The repository contains no personal names, paths, usernames, IDs, projects or personal integrations (such as X, LinkedIn or Notion). Foreman has no telemetry, so it can be adopted at work without cleanup or a privacy review of phone-home behaviour.

### ADR-0004: Examples and placeholders only

**Decided by:** the owner · **Source:** brief 4

The repository ships `config/foreman.example.yaml` and `.env.example` with placeholders only. Real config and memory or state are gitignored. See ADR-0015 for where real files live.

### ADR-0005: Self-hosted and BYOK

**Decided by:** the owner · **Source:** brief 5

Foreman runs entirely locally or on a VPS, using the operator's own keys and subscriptions. There is no SaaS component and no vendor-run daemon.

### ADR-0006: No required provider or coding agent

**Decided by:** the owner · **Source:** brief 6, round 2

No model provider or coding agent is required, and there is no lock-in to any one of them. This includes the reference adapter: Foreman must install, validate config and run its test suite with no real agent present.

### ADR-0007: TypeScript on Bun, tested with real fixtures

**Decided by:** the owner · **Source:** brief 7

The stack is TypeScript on Bun. Nothing found during the grill is a strong enough reason to change it. Tests run with `bun test` against fake fixtures (a fake worker adapter and temporary git repositories) rather than mocks of git. `bun run build`, covering typecheck and build, must pass.

Runtime dependencies stay minimal: zod for schemas and a YAML parser (delegated engineering).

### ADR-0008: Supported platforms

**Decided by:** delegated engineering · **Source:** consequence of Q1, Q2, Q9

v0.1 targets Linux and macOS. Windows is unsupported because the lock, hook and process-ancestry behaviour assumes POSIX semantics. The optional Sandbox (ADR-0035) is Linux-only, because it uses bubblewrap.

### ADR-0009: v0.1 scope and roadmap

**Decided by:** the owner · **Source:** brief 8, brief 9

v0.1 includes:

- pluggable Adapters
- a declarative Pipeline with Gates
- parallel git worktrees with atomic Task Locks
- verification as a Gate
- human Approval before Outbound Actions
- a resumable Ledger
- a Guard Policy that denies `.env` reads
- the self-improvement loop
- the multi-project Workspace
- Roles
- onboarding (`foreman init`)
- Model Assignment

The dashboard, cost and difficulty routing, and budgets are deferred to v0.2 and listed in the README roadmap.

### ADR-0010: Deliverables and local-only development

**Decided by:** the owner · **Source:** brief 10, brief 11, setup

The deliverables are `README.md` (quickstart, architecture, safety model, roadmap), `README.pt-BR.md`, `LICENSE`, `CONTRIBUTING.md`, `docs/spec.md`, `docs/tickets.md` or `docs/tickets/`, `docs/decisions.md`, `GLOSSARY.md`, `.gitignore`, `config/foreman.example.yaml` and `.env.example`.

Development stays local, in small verifiable commits under the identity configured in the repository, with no remote, no push and no hosted repository. Implementation is done by T3 Code on the owner's local Linux machine.

## B. Workspace, configuration and onboarding

### ADR-0011: Multi-project Workspace with a typed graph

**Decided by:** the owner · **Source:** workspace, init

The primary use case is orchestrating Workers inside one Workspace of about five strongly related Projects. Config declares each Project (path or repository, stack, build, test and verify commands, optional owners) and the typed Edges between them: `depends-on`, `calls-api`, `shares-lib`, `publishes-event` and `consumes-event`. The Router uses the graph for Task ordering and impact analysis.

### ADR-0012: Roles are declared in config

**Decided by:** the owner · **Source:** workspace

Roles such as backend, frontend, tests, docs and reviewer are declared in config, each with its Adapter, model, prompts, allowed tools and allowed Projects. The Router assigns Tasks by Role and Project. Nothing hardcodes a particular Role.

### ADR-0013: Generic core, everything else in validated config

**Decided by:** the owner · **Source:** workspace

Projects, the graph, Roles, Pipeline Steps, Gates, prompts, policies and locale are config or plugins, not code, so needs can change without forking Foreman. The only exception is the Safety Floor (ADR-0044). The schema is validated (zod) and reports clear errors. `foreman init` scaffolds an example Workspace, and `tests/fixtures` holds an example with three or more fake interdependent services.

### ADR-0014: Plugins are explicit local modules

**Decided by:** delegated engineering · **Source:** consequence of "config or plugins" (workspace)

Built-in Adapters and Remotes come from a registry. Custom ones are local module paths declared explicitly in human-edited config, and custom Gates are command Gates in YAML. There is no plugin auto-install or registry download, because a plugin runs with Foreman's full trust. A Change Proposal that adds a module path always requires human Approval.

### ADR-0015: Workspace directory layout

**Decided by:** the owner · **Source:** Q10

`foreman init` targets a separate Workspace directory chosen by the operator, because five separate repositories share no common root and proposals must be reviewable as diffs:

- `foreman/foreman.yaml`: models, Roles, Pipeline and policies.
- `foreman/workspace.yaml`, `foreman/graph.md` (rendered Mermaid), `foreman/context.md` and per-project notes.
- `memory/`: Ledger, locks, Lessons and Runs. Always gitignored.
- `.env`: never committed.

Everything under `foreman/` is free of secrets and can be versioned by the operator. In the Foreman source repository these real paths are gitignored and only examples are committed. This refines ADR-0004: "real config is gitignored" applies to the source repository, while `foreman/` in the operator's own Workspace is theirs to version.

### ADR-0016: Onboarding is a guided interview plus a repository graph

**Decided by:** the owner · **Source:** setup, init

Onboarding is available both as the `foreman init` CLI command and as an agent skill (`.agents/skills/foreman-init/SKILL.md`) usable from any coding agent. It asks one question at a time with a recommended answer, and non-interactive use is available through flags or a file. It collects domain context, goals, scope (allowed Projects and paths, forbidden areas), constraints, conventions, policies, and models and subscriptions. The operator references repositories by local path or git URL, confirms or edits the proposed graph, and can re-run idempotently with `foreman init --update`.

### ADR-0017: The CLI interview needs no LLM, and there is one write path

**Decided by:** the owner · **Source:** Q14a

`foreman init` has to run before any model is configured, so the CLI runs a scripted interview with recommendations drawn from a deterministic Scan. The skill version is adaptive but writes an answers file applied through `foreman init --from <file>`, so all onboarding passes through the same validation.

### ADR-0018: Scans are read-only and record their evidence

**Decided by:** the owner · **Source:** Q14b, round 2

A Scan treats repository content as untrusted: it reads files and never installs or executes anything. Git URLs are cloned to a Workspace path only after consent. Every proposed Edge records its evidence and `source: detected|confirmed`, and `--update` never overwrites a confirmed Edge.

v0.1 covers:

- JS/TS: `package.json`, bun, npm and pnpm workspaces, tsconfig paths.
- Python: pyproject, requirements.
- Go: `go.mod`.
- Java and Kotlin: pom, gradle.
- Docker and compose.
- OpenAPI, AsyncAPI and proto files.
- Generic HTTP-client and environment-URL heuristics.

### ADR-0019: Model Assignment per Step and Role

**Decided by:** the owner · **Source:** setup, Q14a

The operator maps each Step (grill, spec, tickets, implement, review, retro, routing, lesson extraction) and each Role to a provider, model and variant, based on what they actually have (for example Claude, OpenAI/Codex, DeepSeek, Mistral, Ollama or OpenRouter). Nothing is hardcoded.

Every LLM call goes through a Worker Adapter, so Foreman itself never holds provider keys. Provider detection uses `opencode models` and environment variable names only, never values. Fallbacks use only the explicit list, because an automatic switch could send corporate code to an unapproved vendor.

When both match, the most specific assignment wins: Role and Step together, then Step, then Role, then the Workspace default (delegated engineering).

### ADR-0020: Context Files are injected and can evolve with Approval

**Decided by:** the owner · **Source:** setup

Context persists in `foreman/context.md` and per-project notes, is injected into every Worker, and stays human-editable. The self-improvement loop can propose changes only through the Approval gate (ADR-0047).

## C. Execution

### ADR-0021: The Router core is deterministic

**Decided by:** the owner · **Source:** Q8

The core is a deterministic state machine in TypeScript, not a long-lived LLM thread. LLM judgement (decomposition and Role assignment) runs as a `routing` Step whose output is schema-validated, and ordering then follows the graph in code. A prompt injection or a bad model response therefore can't redirect control flow beyond what the schema allows.

### ADR-0022: Worker questions go to the Inbox

**Decided by:** the owner · **Source:** Q8

Worker questions wait in an Operator Inbox (`foreman inbox`, `foreman answer`). The Router may answer on its own only from recorded decisions, only if enabled, always logged as Answered by Router, and never for a Gate.

### ADR-0023: Foreground process, no service

**Decided by:** the owner · **Source:** Q9

`foreman run` is a foreground process that supervises Workers as children and can exit at a human Gate. `foreman resume` reconciles and continues. There is no background service in v0.1. On a VPS, operators use tmux or their own systemd unit, and the docs show how. With a TTY attached the human Gate prompts inline; otherwise the process records the wait and exits (delegated engineering).

### ADR-0024: Declarative Pipeline and Step granularity

**Decided by:** the owner · **Source:** brief 8b, Q12

The AIHero Pipeline (grill → spec → tickets → implement → review → retro) is declared in YAML, with Gates between Steps. `grill`, `spec`, `tickets` and `retro` run once per Run. `implement` and `review` run once per Task.

### ADR-0025: `tickets` drafts Tasks, `routing` assigns them

**Decided by:** delegated engineering · **Source:** resolves an overlap between Q8 and Q14c

Q8 gives decomposition to `routing` and Q14c says the `tickets` Step produces Tasks. To keep one owner for each concern, `tickets` drafts the Tasks from the spec (scope and acceptance criteria). `routing` then runs immediately after it and assigns each Task's Project, Role and Task-level dependencies. Code validates that output against allowed Roles and Projects, and computes the final order from the Workspace Graph.

### ADR-0026: Cross-project flow

**Decided by:** the owner · **Source:** workspace, Q11

- Downstream Tasks start only after Upstream passes verification.
- Each Edge type sets the order: `calls-api` and the event Edges go contract-first (the contract change is verified first, then both sides proceed), while `shares-lib` and `depends-on` go Upstream-first.
- Workers and the Integration Verification command receive `FOREMAN_WORKTREE_<PROJECT>` paths. An optional per-project `link` command wires them together, for example `bun link` or a compose override.
- Integration Verification runs at the end of the Run.
- On failure the Run halts and keeps its work, with no automatic rollback, and the operator can retry or abandon.
- Outbound Approvals are presented as one set, in topological order.

### ADR-0027: Graph cycles

**Decided by:** delegated engineering · **Source:** edge case of Q11

A cycle of `depends-on` or `shares-lib` Edges is a config validation error, since no build order exists. `calls-api` and event cycles are legitimate in real systems, so they only produce a warning. If a Run's Tasks fall inside such a cycle, it pauses and asks the operator for the order through the Inbox.

### ADR-0028: Worktrees and branches

**Decided by:** the owner · **Source:** brief 8c, Q5

Each Task gets its own git worktree and branch, and each Run gets one local Integration Branch per Project, so Workers run in parallel without sharing a working directory. A merge conflict goes back to a Worker as a Task.

Branch names are `foreman/<runId>/task-<taskId>` and `foreman/<runId>/integration`. Projects sharing one repository share its Integration Branch (delegated engineering).

### ADR-0029: Task Locks are atomic, expiring and fenced

**Decided by:** the owner on format and requirements, delegated engineering on mechanics · **Source:** brief 8c, round 2

Two Workers must never take the same Task, and an abandoned Task must be recoverable.

- A lock is created with `O_EXCL`, so only one claimant can succeed.
- It holds a random holder token, a generation number, a heartbeat time and a TTL. It contains no pid, hostname or username. Staleness is decided only by an expired heartbeat.
- The supervisor renews it with write-to-temp, fsync and atomic rename. Defaults are a 30-second heartbeat and a 120-second TTL, both configurable.
- To take over, a claimant first renames the stale lock aside. Only one rename can succeed, so only one claimant proceeds to a fresh `O_EXCL` create.
- The generation number comes from the Ledger. Task-closing events must carry the current generation, so a zombie holder can't close a Task it has lost.
- Recovery keeps the work: commits stay on the Task branch, uncommitted changes are saved as a patch in the Run's directory under `memory/`, and any surviving Worker is cancelled before the Task is reassigned.
- A Run has its own lock of the same kind, so two supervisors can't drive one Run.
- Locks need a local filesystem. Network filesystems are unsupported.

### ADR-0030: The Ledger is append-only JSONL

**Decided by:** the owner on format and requirements, delegated engineering on mechanics · **Source:** brief 8f, round 2

`memory/ledger.jsonl` is the source of truth, and other state is derived from it. JSONL was chosen over SQLite because it is inspectable, append-only by construction and needs no migration tooling.

- Each line carries `schemaVersion`, a unique `eventId`, and where applicable an `actionId` and `state` (`pending` or `done`, with an `outcome` on `done`).
- `actionId` is deterministic, derived from Run, Task, action kind, target and head SHA, so a repeated action is recognized as the same one.
- A state change is a new line. Lines are never edited.
- `pending` is appended and fsynced before an action, and `done` after it.
- Each line is one `O_APPEND` write followed by fsync.
- After a crash, an unparseable final fragment is ignored and reported. Corruption elsewhere stops Foreman with a clear error.
- The Ledger and lock files never store hostnames or usernames. Paths are stored relative to the Workspace, since absolute paths commonly contain usernames.

### ADR-0031: Reconciliation on resume

**Decided by:** the owner · **Source:** brief 8f, round 2

`foreman resume` checks every `pending` action without a `done` against actual state rather than repeating it blindly. For example, it compares `git ls-remote` with the expected SHA, or looks up an open PR by head branch, then records `done` if the action already happened. An Outbound Action that didn't happen still needs a valid Approval to be attempted again (delegated engineering).

### ADR-0032: Adapter contract

**Decided by:** the owner · **Source:** brief 8a, round 2

An Adapter implements `start`, `send`, `status`, `diff` and `cancel`, and declares capabilities. These include `enforcesPolicy`, plus session resume, model selection and read-only execution (delegated engineering; `routing` and lesson extraction need read-only runs). A Worker's question surfaces as a `waiting_input` status (delegated engineering).

v0.1 ships:

- An OpenCode reference Adapter driven through its CLI (`opencode run --format json`).
- A fake Adapter for tests.
- Stubs for T3 Code, Claude Code, Codex and Pi. Stubs declare `enforcesPolicy: false` and fail with a clear "not implemented" error.

No Adapter is required. A shared contract test suite runs against every non-stub Adapter (delegated engineering).

### ADR-0033: OpenCode Adapter must confirm its isolation

**Decided by:** delegated engineering · **Source:** OpenCode 2.2.6 `--help`, Q1

**Unverified assumption.** These findings come from CLI help text only and have not been tested.

- `--auto` approves everything not explicitly denied, so unattended runs depend entirely on Foreman generating explicit deny rules.
- By default `opencode` connects to a shared background service, whose tools may not inherit Foreman's scrubbed environment. The Adapter therefore always passes `--standalone`.
- Foreman owns worktree creation, so the Adapter doesn't use OpenCode's `--worktree`.

The Adapter starts with `enforcesPolicy: false`. The Adapter's first ticket must prove with a test that a deny rule also stops `cat .env` through the shell, and that the standalone server's tools receive the scrubbed environment. Only then may the flag become `true`. If either test fails, the Adapter stays `false` and needs the operator's opt-in (ADR-0035).

### ADR-0034: Verification produces Evidence

**Decided by:** the owner · **Source:** brief 8d, Q12

A Task closes only with Evidence. Foreman runs the configured commands itself and never accepts a Worker's claim, recording the command, exit code, output hash and SHA in the Ledger.

The diff check requires that the diff is non-empty, stays within the Role and Project scope, avoids forbidden paths and contains no secret patterns. Deleted or skipped tests are flagged for the reviewer. The reviewer must be a different Worker from the implementer. Three failed rounds escalate to the Operator (configurable).

Verification commands execute Worker-written code, so they run with the same scrubbed environment and Sandbox setting as the Worker (delegated engineering).

## D. Safety

### ADR-0035: Worker containment is layered, and its limit is stated

**Decided by:** the owner · **Source:** Q1

Foreman can't hook into every agent, and a Worker with a shell can attempt anything its user can. Layers instead of a mandatory sandbox keep Foreman usable on any machine:

1. Worktrees contain no untracked secrets, and any copied file is checked against the deny list.
2. The Worker environment is built from an allowlist, with no tokens passed through (see ADR-0036).
3. Each Adapter must declare `enforcesPolicy`. Foreman refuses to start one that can't enforce unless the operator opts in for that Adapter.
4. Foreman checks the diff and the secret patterns at the Gate.
5. Each worktree gets a pre-push hook.
6. An optional `sandbox: bwrap` setting is available on Linux.

The README states plainly that without the Sandbox this guards against mistakes, not a malicious Worker running under the same user.

For layer 5, Foreman injects `core.hooksPath` through the Worker's `GIT_CONFIG_*` environment rather than editing the repository's config, and project hooks other than pre-push are chained. Foreman's own approved pushes run without that environment (delegated engineering). `--no-verify` bypasses a pre-push hook, which is one reason the hook is a layer and not the boundary.

### ADR-0036: Credential boundary

**Decided by:** delegated engineering · **Source:** resolves a gap in Q1 and Q3 against BYOK

"No tokens passed through" and BYOK collide, because a Worker's agent needs model-provider credentials to run at all. The rule that resolves this:

- An Adapter may declare explicit `env.passthrough` names for model-provider credentials only.
- Remote and deploy credentials can never be passed through. `GH_TOKEN`, `GITHUB_TOKEN` and `SSH_AUTH_SOCK` are refused by the Safety Floor, and custom Remotes declare their own.
- Workers get `GH_CONFIG_DIR` pointed at an empty directory and `GIT_TERMINAL_PROMPT=0`.

**Residual risk.** Without the Sandbox, a Worker running as the same user can still read credential files in that user's home directory, such as OpenCode's stored provider auth, `~/.ssh` or the default `gh` config, if it goes looking for them. The README safety model must say this. On a shared or high-value machine, the operator should use the Sandbox or run Foreman under a dedicated user.

### ADR-0037: Workers are denied `.env` by default

**Decided by:** the owner · **Source:** brief 8g, Q7

The Guard Policy denies Workers access to `.env` and similar secret files by default. The only exceptions are explicit ones, such as `.env.example`, set in human-edited config.

### ADR-0038: Only an authenticated human can approve

**Decided by:** the owner · **Source:** brief 8e

Human Approval is required before push, PR, merge or deploy. A message or comment from an agent never counts as Approval. An Approval must arrive through a Human Channel: the local CLI used by the Operator, or a configured allowlist of human GitHub logins verified through the API. A deploy is a configured command that Foreman runs, not a Worker action (delegated engineering).

### ADR-0039: Local CLI Approval resists forgery

**Decided by:** the owner · **Source:** Q2

A Worker with a shell could run `foreman approve` under the same user as the Operator. `foreman approve` therefore requires all of these:

- An interactive TTY.
- The Operator typing a short nonce bound to that action.
- No `FOREMAN_WORKER` marker in the environment, and no Worker among its ancestor processes.

The command is also on the Guard Policy's deny list. Without the Sandbox this makes forgery hard rather than impossible, and the safety model says so. Operators should not approve from inside another agent's session, since some agents can provide a PTY.

### ADR-0040: GitHub Approval requires a distinct identity

**Decided by:** the owner · **Source:** Q3

An agent that uses a human's GitHub token posts under that human's login, so a login allowlist alone would accept an agent's comment as human Approval. GitHub Approval is therefore opt-in and valid only if:

- The approver is on the allowlist and has account type `User`.
- The approver's login differs from the identity of Foreman's own token. Foreman checks this at startup and refuses to run otherwise.
- Workers never receive that token.
- The Approval is a PR review or a `/foreman approve <actionId>` comment.

A consequence is that GitHub Approval needs a separate identity for Foreman's token. An operator with a single account uses the local CLI.

To keep usernames out of the Ledger (ADR-0030), Approval records store the Human Channel, an opaque approver alias from the configured allowlist, and the numeric review or comment ID, never the login (delegated engineering).

### ADR-0041: Approval binds to the exact action

**Decided by:** the owner · **Source:** Q4

An Approval is bound to `actionId`, target and exact head SHA or diff hash. Any change invalidates it and requests Approval again. It is single-use and expires after a configurable 24 hours by default.

### ADR-0042: What counts as a merge

**Decided by:** the owner · **Source:** Q5

Merging a verified Task into its local, Foreman-owned Integration Branch needs no human Approval. Anything that leaves the machine or touches a Project's default or protected branch does.

### ADR-0043: Modes and the limit of autonomy

**Decided by:** the owner · **Source:** brief 8e, Q6

Propose is the default Mode. Autonomous is opt-in per repository, with an allowlist. That allowlist can cover only `push` to Foreman-owned branches and opening a draft PR. Merging to the default branch and deploying always need a human, in every Mode, hardcoded and tested.

### ADR-0044: The Safety Floor lives in code

**Decided by:** the owner · **Source:** Q7

Because everything else is config, these rules are enforced in code and can't be configured away:

- Agent messages are never Approvals.
- Approval Gates on Outbound Actions can't be removed.
- A Task can't close without Evidence.
- The `.env` deny rule stays, with only explicit exceptions as in ADR-0037.
- Merge and deploy always need a human (ADR-0043).
- Remote and deploy credentials are never passed to Workers (ADR-0036).

Config that violates the floor fails validation. A Change Proposal to structured config gets a before-and-after check, and one that relaxes the floor is rejected outright rather than queued, including one that sets an Adapter's `enforcesPolicy` opt-in. Free-text proposals always go to human Approval, since text can't be mechanically proven not to relax a rule. The floor holds whatever a prompt says, because code enforces it.

## E. Remotes

### ADR-0045: Generic Remote interface, GitHub first

**Decided by:** the owner · **Source:** round 2

Remote actions go through a generic `Remote` interface, with GitHub as the reference implementation through `gh` or REST using a token supplied by the operator and never passed to Workers. Other hosts are stubs or roadmap items.

### ADR-0046: Inbound polling is optional and read-only

**Decided by:** the owner · **Source:** round 2

GitHub event polling is in scope but off by default. Its only effects are surfacing events in the Inbox and, if enabled, recognizing human Approvals under ADR-0040. It never triggers Outbound Actions by itself. Runs still start only from a local Intent, and text by authors outside the allowlist reaches the Inbox as metadata only, so it can't act as a prompt injection (delegated engineering).

## F. Learning

### ADR-0047: The self-improvement loop

**Decided by:** the owner · **Source:** brief 8h, workspace

After each Task or retro, and when a failure gets resolved, Foreman records a structured Lesson: symptom, root cause, fix and detection hint. Lessons live in `memory/lessons.jsonl`, gitignored by default, with `config/lessons.example.jsonl` as the committed example (location: delegated engineering). "Versioned" means append-only records with a schema version and `supersedes`.

Foreman auto-applies only low-risk changes to its own memory and Lesson files. Instructions, prompts, config, Roles, the Pipeline, policies and code change only through a Change Proposal and the same human Approval gate as any diff. Every Lesson and Change Proposal event is audited in the Ledger. `foreman proposals` lists, approves and rejects them.

Required tests use fixtures. They must show that a repeated error produces a Lesson that is reused and injected on the next Run, and that a Lesson can't relax a safety rule.

### ADR-0048: Lesson retrieval is deterministic

**Decided by:** the owner · **Source:** Q13

Embeddings would require a provider, conflicting with ADR-0006. Retrieval therefore uses deterministic scoring on Project, stack, Role, Step, file globs and a normalized error fingerprint, with a top-K and a token cap.

Deduplication uses that fingerprint and increments Occurrence Count and Confidence. Lessons come from two sources: deterministic capture of failure-then-resolved pairs, and a schema-validated `lesson-extraction` Step.

### ADR-0049: Lessons are untrusted data

**Decided by:** the owner · **Source:** Q13

Lessons derive from agent output, so one could say "skip the tests" or carry a secret. Secrets are redacted before storage, along with home-directory paths (delegated engineering). Lessons are injected in a fenced block marked as data, not instructions. A Lesson qualifies for injection with 2 or more occurrences or an explicit Approval (configurable). A poisoned Lesson that does get through still can't bypass the Safety Floor, because code enforces it.

## G. Language

### ADR-0050: Canonical vocabulary

**Decided by:** the owner · **Source:** Q14c

`foreman init` is the only onboarding command, with no `setup` command. **Run** is one Intent. **Step** is one Pipeline stage. **Task** is what a Worker locks, and the `tickets` Step produces Tasks. **Role** replaces "worker profile". **Mode** (`propose` or `autonomous`) and **Change Proposal** are kept separate, so "proposal" never refers to the Mode. `GLOSSARY.md` holds the full vocabulary.

`docs/tickets` remains the name for Foreman's own development backlog (a deliverable in ADR-0010). It is not a product concept.
