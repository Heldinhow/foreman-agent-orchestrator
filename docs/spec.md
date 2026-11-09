# Foreman v0.1 specification

This spec covers the whole v0.1 scope. Terms are defined in [`GLOSSARY.md`](../GLOSSARY.md), and rationale is in [`docs/decisions.md`](decisions.md), cited here as `ADR-NNNN`. If this spec and an ADR disagree, the ADR wins until it is explicitly changed.

File and directory names appear here only where they are part of the product's contract with Operators, such as the Workspace layout and required deliverables. Internal source layout is left to the implementation.

## Problem Statement

Teams want coding agents to take on real engineering work, but a chat with tools doesn't give them an engineering process. Agents skip design, declare success without proof and collide when they run in parallel. They can also read secrets, or push and merge without anyone deciding they should. When a process crashes, nobody knows what already happened. When an agent makes the same mistake twice, nothing learned the first time carries over.

The problem grows in a Workspace of about five strongly related services. A feature that looks like it belongs in one service often needs a contract change in another, a shared library release and a downstream update, in the right order. Each agent sees only its own repository, and nobody verifies that the combined result works.

Existing tools also tend to tie a team to one agent or model provider, or depend on a hosted service. That is often unacceptable for code at work.

## Solution

Foreman gives you "your team of agents with an engineering process, not a chat with tools". It is a self-hosted, BYOK, MIT-licensed command-line orchestrator. An Operator gives it an Intent, and it drives a declared Pipeline across the affected Projects, using any coding agent as a pluggable Worker.

- **Onboarding:** `foreman init` interviews the Operator one question at a time and scans their repositories read-only. It proposes a Workspace Graph, then writes the configuration, Context Files and Model Assignment.
- **Planning:** `foreman run "<intent>"` takes the Intent through grill, spec and tickets, then orders the resulting Tasks by the Workspace Graph.
- **Execution:** each Task runs in its own git worktree under an atomic Task Lock, using a Worker with the right Role and model.
- **Proof:** Foreman runs verification itself and, by default, closes a Task only with Evidence. It then verifies the combined change across Projects.
- **Control:** by default, nothing leaves the machine without a human Approval through an authenticated Human Channel, unless the repository has explicitly allowlisted a low-risk action. Merge and deploy need a human by default.
- **Adaptation:** nothing is hard-locked. Every rule, including those safe values, lives in editable, versioned Policy files. The Policy Owner can change how Foreman handles a situation by editing a file or by saying "from now on, do X when Y". Each change is shown as a diff, confirmed, recorded and reversible, and it applies to new Tasks immediately. Only the Policy Owner can relax a Safety Default. Agents, Worker output, comments and Lessons can only propose.
- **Recovery:** every action is written ahead to an append-only Ledger, so `foreman resume` can reconcile after a crash rather than repeat work blindly.
- **Learning:** resolved failures become deduplicated Lessons that are retrieved and injected into later similar work. Lessons can suggest Change Proposals, which go through the same Approval gate.

No model provider or coding agent is required (ADR-0006), and Foreman has no telemetry (ADR-0003).

## User Stories

### Onboarding

1. As an Operator, I want to run `foreman init` right after cloning, so that I can get a working Workspace without reading the source.
2. As an Operator, I want the interview to ask one question at a time with a recommended answer, so that I can accept good defaults quickly.
3. As an Operator, I want `foreman init` to work before any model is configured, so that onboarding has no dependency on what it is setting up.
4. As an Operator, I want to reference repositories by local path or git URL, so that I can onboard what I already have.
5. As an Operator, I want to be asked before anything is cloned, so that nothing lands on my disk without consent.
6. As a Security Reviewer, I want the Scan to read files and never execute or install anything, so that onboarding an unknown repository can't run its code.
7. As a Security Reviewer, I want the Scan to skip denied files such as `.env`, so that onboarding never reads secrets.
8. As an Operator, I want the Scan to detect stack, build, test and verify commands, so that I don't have to type what the repository already says.
9. As an Operator, I want proposed Edges with their evidence, so that I can judge each one rather than trust a black box.
10. As an Operator, I want to confirm, edit or reject each proposed Edge, so that the Workspace Graph reflects what I know.
11. As an Operator, I want to declare allowed Projects and paths and forbidden areas, so that Workers stay within the scope I set.
12. As an Operator, I want to say which providers and subscriptions I have, so that Foreman only suggests models I can use.
13. As an Operator, I want to map each Step and Role to a provider, model, variant and fallbacks, so that I control quality and cost myself.
14. As a Security Reviewer, I want provider detection to look only at names and never at secret values, so that onboarding doesn't touch credentials.
15. As an Operator, I want a rendered Mermaid view of the graph, so that I can review it at a glance and share it.
16. As an Operator, I want domain context written to editable Context Files, so that I can correct them at any time.
17. As an Operator, I want to run onboarding non-interactively with `--from` or flags, so that I can script and reproduce it.
18. As an Operator working in a coding agent, I want a `foreman-init` skill, so that I can onboard from T3 Code, Claude Code, OpenCode or Codex.
19. As an Operator, I want the skill and the CLI to share one validated write path, so that both produce equally valid configuration.
20. As an Operator, I want `foreman init --update` to pick up repository changes, so that the graph stays current.
21. As an Operator, I want `--update` to leave confirmed Edges and my edits alone, so that re-running is safe.
22. As an Operator, I want identical answers to produce byte-identical files, so that diffs show only real changes.
23. As an Operator, I want an interrupted interview to continue where it stopped, so that I don't lose my answers.

### Configuration

24. As an Operator, I want Projects, the graph, Roles, Pipeline, Gates, prompts, policies and locale in config, so that I can adapt Foreman without forking it.
25. As an Operator, I want invalid config to fail with the file, key and reason, so that I can fix it without reading source code.
26. As an Operator, I want `foreman validate` to check everything before a Run, so that mistakes surface before any tokens are spent.
27. As an Operator, I want to version `foreman/` in my own repository, so that configuration changes are reviewable as diffs.
28. As a Contributor, I want an example configuration with placeholders only, so that the repository contains nothing personal.
29. As an Operator, I want custom Adapters and Remotes loaded only from local paths I declare, so that nothing is installed behind my back.
30. As an Operator, I want custom command Gates in YAML, so that I can add team-specific checks without writing a plugin.
31. As an Operator, I want prompts in English by default and pt-BR when selected, so that my team can work in its language.
32. As an Operator, I want to override a single prompt in my Workspace, so that I can customize without copying them all.

### Running work

33. As an Operator, I want `foreman run "<intent>"` to start a Run, so that one command takes work from idea to verified change.
34. As an Operator, I want Worker questions in an Inbox, so that I can answer them when it suits me.
35. As an Operator, I want to see a Run's state and what it's waiting for, so that I always know the next action.
36. As an Operator, I want a human Gate before implementation by default, so that I can review the plan before spending on it.
37. As an Operator, I want the Router to split an Intent into per-Project Tasks, so that a cross-service feature is planned as a whole.
38. As an Operator, I want Tasks ordered by the Workspace Graph, so that Upstream work comes before the Downstream work that needs it.
39. As an Operator, I want contract-first ordering for API and event Edges, so that both sides build against an agreed contract.
40. As an Operator, I want a warning when a Run changes an Upstream contract without Tasks for its direct Downstream Projects, so that impact isn't missed.
41. As an Operator, I want Tasks assigned by Role and Project, so that a specialist does each piece of work.
42. As an Operator, I want independent Tasks to run in parallel, so that a Run isn't slower than it has to be.
43. As a Downstream Worker, I want access to the verified Upstream worktree, so that I can build against an unmerged change.
44. As an Operator, I want a verified Task merged into a local Integration Branch automatically, so that I'm only asked about things that leave the machine.
45. As an Operator, I want merge conflicts sent back to a Worker, so that a routine conflict doesn't halt the Run.
46. As an Operator, I want a failed Run to halt and keep its work, so that I can retry or abandon it without losing anything.
47. As an Operator, I want the process to exit while it waits for a human and resume later, so that nothing has to stay running.
48. As an Operator on a VPS, I want documented tmux and systemd examples, so that I can run Foreman remotely with no hosted service.
49. As an Operator, I want `foreman resume` to continue a Run after a crash or reboot, so that interruption costs little.

### Proof

50. As an Operator, I want Foreman to run verification itself, so that a Worker's "tests pass" is never taken on trust.
51. As an Auditor, I want each Task's command, exit code, output hash and SHA in the Ledger, so that I can see exactly what was verified.
52. As an Operator, I want a Task rejected when its diff is empty, out of scope, touches forbidden paths or contains secrets, so that a passing test alone isn't enough.
53. As a Reviewer of the output, I want deleted or skipped tests flagged, so that a Worker can't pass by removing the failing test.
54. As an Operator, I want review done by a different Worker from the implementer, so that nobody grades their own work.
55. As an Operator, I want repeated failures escalated after three rounds, so that a stuck Task doesn't burn tokens indefinitely.
56. As an Operator, I want Integration Verification across a Run's Projects, so that the combined change is proven, not only the parts.

### Control and safety

57. As an Operator, I want Propose Mode by default, so that nothing leaves the machine until I say so.
58. As an Operator, I want to allowlist pushing to Foreman-owned branches and opening draft PRs per repository, so that low-risk steps can flow on trusted repositories.
59. As a Security Reviewer, I want merge and deploy to need a human in every Mode by default, so that automating them takes a deliberate, recorded decision by the Policy Owner.
60. As a Security Reviewer, I want an agent's message or comment not to count as Approval by default, and never to count for a Policy Change, so that a Worker can't authorize itself or loosen the rules.
61. As a Security Reviewer, I want `foreman approve` to refuse a Worker and require a typed nonce on a TTY, so that casual forgery fails.
62. As a Security Reviewer, I want GitHub Approval to require an allowlisted human distinct from Foreman's token identity, so that a comment posted with the token can't pass as human.
63. As a Security Reviewer, I want an Approval bound to the exact SHA and invalidated by any change, so that approved code is the code that ships.
64. As an Operator, I want all of a Run's Outbound Actions presented together in dependency order, so that I can approve a coordinated change as a whole.
65. As a Security Reviewer, I want Workers denied `.env` and credentials by default, so that an agent's mistake doesn't leak secrets.
66. As a Security Reviewer, I want Foreman to refuse an Adapter that can't enforce the Guard Policy unless I opt in, so that weak isolation is a conscious choice.
67. As a Security Reviewer, I want the Worker's environment built from an allowlist, so that a new secret on the machine isn't exposed by default.
68. As a Security Reviewer, I want an optional OS Sandbox, so that I can raise the protection on a high-value machine.
69. As a Security Reviewer, I want the README to state the limits of each layer, so that I can assess the risk accurately.
70. As a Security Reviewer, I want any change that relaxes a Safety Default flagged and applied only after the Policy Owner confirms it, so that no safety rule weakens silently.
71. As a Security Reviewer, I want no telemetry and no network use outside Remotes and Workers, so that Foreman can pass a corporate review.

### Recovery and audit

72. As an Auditor, I want an append-only Ledger, so that history can be inspected and isn't rewritten.
73. As a Privacy Reviewer, I want no hostnames or usernames in the Ledger or lock files, so that the audit trail is safe to share.
74. As an Operator, I want two Workers never to hold the same Task, so that parallel work doesn't collide.
75. As an Operator, I want an abandoned Task Lock recovered automatically, keeping its commits and uncommitted changes, so that a crash doesn't lose work.
76. As a Security Reviewer, I want a Worker that lost its lock to be unable to close the Task, so that a zombie can't overwrite the new holder's result.
77. As an Operator, I want `foreman resume` to check whether an interrupted push or PR already happened, so that nothing is duplicated.
78. As an Operator, I want a deploy of unknown outcome brought to me rather than retried, so that an uncertain deploy is never repeated automatically.

### Learning

79. As an Operator, I want resolved failures recorded as Lessons with symptom, root cause, fix and detection hint, so that the fix outlives the session.
80. As an Operator, I want repeated failures deduplicated with an Occurrence Count and Confidence, so that real patterns stand out.
81. As an Operator, I want relevant Lessons injected before similar work, so that Workers don't repeat known mistakes.
82. As an Operator, I want to list, approve and reject Lessons, so that I keep control of what Workers are told.
83. As an Operator, I want Change Proposals for prompts, config, Roles, the Pipeline and instructions, so that Foreman can suggest process improvements.
84. As an Operator, I want to list, inspect, approve and reject Change Proposals from the CLI, so that I decide what changes.
85. As a Security Reviewer, I want a proposal that relaxes a safety rule rejected outright, so that a poisoned Lesson can't weaken the system.
86. As a Security Reviewer, I want secrets redacted before a Lesson is stored and Lessons injected as data, so that the loop isn't a route for leaks or prompt injection.
87. As an Auditor, I want every Lesson and Change Proposal event in the Ledger, so that each change can be traced to its origin.

### Remotes

88. As an Operator, I want push and PR actions through a generic Remote interface, so that other hosts can be added later.
89. As an Operator on GitHub Enterprise, I want a configurable API base URL, so that Foreman works with our instance.
90. As an Operator, I want optional read-only polling that surfaces remote events in the Inbox, so that I can see activity without leaving the CLI.
91. As a Security Reviewer, I want polling never to trigger an Outbound Action and to withhold text from unknown authors, so that outsiders can't drive or inject into a Run.

### Project and contribution

92. As a new user, I want a README with quickstart, architecture, safety model and roadmap, so that I can evaluate and start quickly.
93. As a pt-BR reader, I want `README.pt-BR.md` kept in step with the English README, so that I get the same information.
94. As a Contributor, I want `CONTRIBUTING.md` and a test suite with no external dependencies, so that I can contribute with no API keys or accounts.
95. As an Adapter author, I want a shared contract test suite, so that I can prove my Adapter behaves correctly.

### Changing how Foreman behaves

96. As a Policy Owner, I want every rule in editable files with safe defaults, so that Foreman can adapt as my context changes without a fork.
97. As a Policy Owner, I want layers from built-in up to user override, so that I can set a rule at the right level.
98. As a Policy Owner, I want to see which layer set any value, so that I can understand why Foreman behaved as it did.
99. As a Policy Owner, I want to say "from now on, do X when Y" and get a diff to confirm, so that I can change behaviour without learning the schema.
100. As a Policy Owner, I want to edit a file by hand and confirm the diff, so that I can keep working in my editor.
101. As a Policy Owner, I want a Relaxation flagged prominently before I confirm it, so that I always know when I'm reducing protection.
102. As a Policy Owner, I want an accepted change to apply to new Tasks with no restart, so that a correction takes effect straight away.
103. As a Policy Owner, I want in-flight Tasks to keep the Policy they started with, so that the rules don't shift under running work.
104. As a Policy Owner, I want `foreman policy history` and `foreman policy revert`, so that I can undo a change I regret.
105. As an Auditor, I want who, when, why and before and after hashes for each Policy Change, so that I can reconstruct how the rules evolved.
106. As a Security Reviewer, I want a Worker's edit to a Policy file to have no effect, so that an agent can't change the rules by writing to disk.
107. As a Security Reviewer, I want a policy file inside a Project's repository ignored, so that repository content can't set the rules.
108. As a Security Reviewer, I want `foreman status` to list every deviation from the Safety Defaults, so that I can see at a glance how protected a Workspace is.
109. As a Policy Owner, I want a Foreman upgrade's new defaults shown as a diff for me to confirm, so that an update can't quietly change behaviour.
110. As a Policy Owner, I want to make a change myself even after a Lesson's proposal of it was rejected, so that the agent limit doesn't limit me.

## Implementation Decisions

### Modules

Each module should present a small interface over substantial behaviour. They are listed in dependency order.

| Module | Responsibility |
|---|---|
| **Config** | Load, parse and validate all Workspace config with zod. Report errors with file, key and reason. |
| **Workspace Graph** | Normalize Edges, compute order and impact, detect cycles, render Mermaid. |
| **Ledger** | Append events, replay into derived state, list unfinished actions. |
| **Policy** | Merge Policy Layers, manage Policy Snapshots, classify Relaxations, and apply, record and revert Policy Changes. |
| **Check Engine** | Evaluate Policy rules at each checkpoint and return a decision naming the rule and Policy Layer. |
| **Locks** | Acquire, renew, take over and release Task and Run locks. |
| **Worktrees** | Create Task worktrees and read-only views, capture and salvage work, clean up. |
| **Guard Policy** | Build Worker environments and hooks from Policy, and hand the rules to Adapters. |
| **Adapters** | The contract, registry, OpenCode Adapter and stubs. |
| **Prompts and Context** | Resolve prompts by locale and assemble Worker context. |
| **Pipeline Engine** | The deterministic state machine that runs Steps and evaluates Gates. |
| **Router** | Validate routing output, order Tasks, assign Roles, answer from recorded decisions when enabled. |
| **Verification** | Run commands, record Evidence, perform the diff check. |
| **Approvals** | Human Channels, nonces, binding, expiry. |
| **Outbound Executor** | The only code path that performs Outbound Actions. |
| **Remote** | The interface and the GitHub implementation. |
| **Inbox** | Questions, Gate requests, notices and surfaced remote events. |
| **Polling** | Optional read-only event intake. |
| **Lessons** | Capture, fingerprint, deduplicate, score, redact, retrieve. |
| **Change Proposals** | Generate, reject Relaxations, store and apply. |
| **Scanner** | Read-only repository inspection. |
| **Init** | Scripted interview, answers file, file generation, `--update`. |
| **CLI** | Commands, exit codes and the composition root. |

### Workspace layout

This layout is the product's on-disk contract (ADR-0015). `foreman init --dir <path>` creates it in a directory chosen by the Operator, separate from the Projects.

```text
<workspace>/
  foreman/                 secret-free, versioned by the Operator if they choose
    foreman.yaml           adapters, models, roles, pipeline, policies, approvals, remote, lessons, limits
    workspace.yaml         projects and typed edges
    graph.md               rendered Mermaid (generated)
    context.md             Workspace context, injected into every Worker
    projects/<project>.md  per-Project notes, injected when that Project is in scope
    projects/<project>.yaml  Project Policy Layer (optional)
    prompts/<locale>/      optional prompt overrides
  memory/                  always gitignored
    ledger.jsonl
    lessons.jsonl
    proposals.jsonl
    policy/                accepted Policy Snapshots, content-addressed
    locks/
    runs/<runId>/          artifacts, evidence, inbox bodies, patches, views, worktrees
    cursors/
  .env                     Foreman's own secrets, never committed, never passed to Workers
  .gitignore               generated, covers memory/ and .env
```

Two other Policy locations sit outside the Workspace: the shipped `policy/defaults.yaml` in Foreman's installation, and the user override at `$XDG_CONFIG_HOME/foreman/override.yaml` (or `~/.config/foreman/override.yaml`).

### CLI

| Command | Purpose |
|---|---|
| `foreman init [--dir] [--repo <path\|url>]... [--from <file>] [--yes] [--update]` | Onboarding |
| `foreman validate` | Validate all config and report Adapter status, drift from the accepted Policy, and deviations from the Safety Defaults |
| `foreman graph [impact <project>]` | Print the graph, or a Project's transitive Downstream |
| `foreman run "<intent>"` | Start a Run |
| `foreman resume [<runId>]` | Reconcile and continue |
| `foreman status [<runId>]` | Show Run and Task state, what is awaited, and active warnings |
| `foreman retry <taskId>` / `foreman abandon <runId>` | Decide a halted Run |
| `foreman inbox` / `foreman answer <itemId> "<text>"` | Read and answer questions |
| `foreman approve <actionId\|runId>` / `foreman reject <actionId\|runId>` | Decide Gates and Outbound Actions |
| `foreman lessons list\|show\|approve\|reject` | Manage Lessons |
| `foreman proposals list\|show\|approve\|reject` | Manage Change Proposals |
| `foreman policy show [--effective] [--explain <key>] [--deviations]` | Show Policy, which layer set a key, and differences from the Safety Defaults |
| `foreman policy change "<text>"` | Draft a Policy Change from natural language, then confirm it |
| `foreman policy apply [--from <file>] [--from-pr <number>] [--yes]` | Show and accept changed Policy files or a drafted diff |
| `foreman policy history` / `foreman policy revert <changeId>` | List and undo Policy Changes |
| `foreman poll` | One-shot remote read, if polling is enabled |

Exit codes: `0` success, `1` runtime error, `2` usage or invalid config, `3` waiting on a human, `4` Run halted. Exit code `3` is a normal result, so scripts can tell waiting apart from failing.

Every command except `foreman init` finds the Workspace from `--dir`, then `FOREMAN_WORKSPACE`, then the nearest ancestor containing `foreman/foreman.yaml`.

### Configuration

All config has a `schemaVersion`. The shapes below show the decision-rich parts; the zod schemas are the full definition.

**`workspace.yaml`**

```yaml
schemaVersion: 1
projects:
  catalog-api:
    path: ../catalog-api          # relative to the Workspace, or `repo:` for a git URL
    stack: [typescript]
    commands:
      build: bun run build
      test: bun test
      verify: bun run contract:check
    baseRef: main
    link: bun link                # optional, wires this Project to an unmerged Upstream
    copyFiles: [fixtures/local.json]  # optional, untracked files for worktrees, checked against the deny list
    deploy:                       # optional, needs a human Approval by default
      command: ./scripts/deploy.sh
      check: ./scripts/deploy-status.sh   # optional, lets resume reconcile an interrupted deploy
      credentialEnv: [EXAMPLE_DEPLOY_TOKEN]   # never passed to Workers
    owners: [team-placeholder]    # optional
edges:
  - from: orders-api
    to: catalog-api
    type: calls-api
    source: confirmed             # detected | confirmed
    contract: openapi/catalog.yaml
    evidence:
      - { file: src/catalog-client.ts, line: 12, signal: http-client-env-url }
integration:
  verify:
    - bun run integration:test
```

**Edge direction.** For `depends-on`, `calls-api`, `shares-lib` and `consumes-event`, `from` is Downstream and `to` is Upstream. For `publishes-event`, `from` is Upstream and `to` is Downstream. The Workspace Graph module normalizes this, so nothing else needs to know.

**`foreman.yaml`**

This is the Workspace Policy Layer. It holds only what differs from the built-in defaults, so the keys below are illustrative. Project and user-override layers use the same schema, limited to the keys valid at that level.

```yaml
schemaVersion: 1
locale: en
adapters:
  opencode:
    type: opencode
    allowUnenforced: false
    env: { passthrough: [EXAMPLE_PROVIDER_API_KEY] }
models:
  default: { adapter: opencode, model: "provider/model#variant", fallbacks: [] }
  steps: { implement: { model: "provider/model" } }
  roles: { reviewer: { model: "provider/model" } }
  overrides: [{ step: review, role: reviewer, model: "provider/model" }]
roles:
  backend:
    adapter: opencode
    prompts: [role-backend]
    tools: [read, edit, bash]
    projects: [catalog-api, orders-api]
    paths: { allow: ["**"], forbid: ["infra/**"] }
pipeline: { ... }                 # see Pipeline
policies:
  guard:
    rules:                        # merged by rule ID; see Guard Policy and Check Engine
      deny-secret-files: { except: [".env.example", "tests/fixtures/*.pem"] }
  sandbox: none                   # none | bwrap
  repositories:
    catalog-api: { mode: propose }
    orders-api: { mode: autonomous, allow: [push, draft-pr] }
approvals:
  ownerAlias: operator
  expiryHours: 24
  github:
    enabled: false
    allowlist: [{ alias: approver-1, login: example-human-login, policyOwner: false }]
remote: { type: github, apiBaseUrl: "https://api.github.com" }
polling: { enabled: false, intervalSeconds: 300 }
lessons: { topK: 5, tokenCap: 1500, minOccurrences: 2 }
router: { answerFromDecisions: false, decisionFiles: [] }
limits: { maxActiveWorkers: 3, maxRounds: 3, workerTimeoutMinutes: 60 }
```

**Validation rules beyond shape:**

- References resolve: every Role, Adapter, Project and prompt that is named must exist.
- Every Project declares at least one verification command, since a Task can't otherwise close.
- `FOREMAN_WORKTREE_<PROJECT>` names don't collide after normalization.
- A cycle of `depends-on` or `shares-lib` Edges is an error. A `calls-api` or event cycle is a warning (ADR-0027).
- Unknown keys are errors, so a misspelled safety key can't silently leave a different value in force.

### Model Assignment

Resolution follows ADR-0019: Role and Step override, then Step, then Role, then Workspace default. A model reference is an opaque `provider/model#variant` string that only the Adapter interprets, so nothing about providers is hardcoded.

An Adapter failure in the category `provider_unavailable`, `rate_limited` or `auth` moves to the next entry in the explicit `fallbacks` list and logs that in the Ledger. A poor-quality result never triggers a fallback, and an empty or exhausted list halts the Step. There is no implicit fallback.

### Adapter contract

Every Adapter implements this contract (ADR-0032). This is a contract definition, not prototype code.

```ts
interface Adapter {
  readonly id: string;
  readonly capabilities: {
    enforcesPolicy: boolean;
    resumableSessions: boolean;
    modelSelection: boolean;
    readOnly: boolean;
  };
  start(spec: WorkerSpec): Promise<WorkerHandle>;
  send(handle: WorkerHandle, message: string): Promise<void>;
  status(handle: WorkerHandle): Promise<WorkerStatus>;
  diff(handle: WorkerHandle): Promise<string>;
  cancel(handle: WorkerHandle): Promise<void>;
}

type WorkerSpec = {
  cwd: string;
  prompt: string;
  env: Record<string, string>;  // exact environment: the Adapter adds nothing and inherits nothing
  policy: GuardPolicy;
  model?: string;
  readOnly: boolean;
  sandbox?: SandboxSpec;
};

type WorkerHandle = { adapterId: string; sessionRef: string };  // serializable, persisted for resume

type WorkerStatus =
  | { state: "running" }
  | { state: "waiting_input"; question: string }
  | { state: "completed"; output: string }
  | { state: "failed"; category: FailureCategory; message: string }
  | { state: "cancelled" }
  | { state: "unknown" };  // the handle can't be resolved, for example after a crash
```

- `diff` is informational. Gates always read git directly, so an Adapter that misreports its diff can't affect Evidence.
- Output is untrusted. Foreman parses a fenced `foreman-result` JSON block from the final message and validates it against the Step's schema. An invalid block gets one corrective `send`; a second failure fails the round.
- A Worker that needs input ends its turn with a `foreman-question` block, which the Adapter reports as `waiting_input`.
- Stubs for T3 Code, Claude Code, Codex and Pi declare `enforcesPolicy: false` and fail with a clear "not implemented" error.
- The fake Adapter lives in test fixtures and is loaded through the local-module mechanism (ADR-0014). The shipped CLI has no built-in fake.

### OpenCode reference Adapter

The Adapter drives `opencode run --standalone --format json` per ADR-0033. `start` and `send` are one CLI invocation each, linked with `--session`. The model is passed with `-m`. It uses `--auto` only with explicit deny rules in place, and never uses `--worktree`, since Foreman owns worktrees.

**Required first proof.** The Adapter ships with `enforcesPolicy: false`. Its first ticket must prove the following with tests, recording the OpenCode version tested:

1. A deny rule stops a read of a `.env` canary through OpenCode's file tool.
2. A deny rule also stops `cat .env` through its shell tool, and the canary value never appears in output.
3. Tools running under `--standalone` receive the scrubbed environment: a canary variable set in the supervisor's environment is not visible through `env`, and the variables Foreman passes are visible.
4. Read-only execution is enforced, or the capability is declared `false`.
5. The real `--format json` output is captured as a fixture, including a failure case, so the parser is tested against reality.

Only if all of 1–3 pass may `enforcesPolicy` become `true`. Otherwise it stays `false`, the Adapter refuses to start, and the Operator has to set `allowUnenforced: true` for it.

These tests should be deterministic by pointing OpenCode at a local fake provider that scripts the tool calls, so they need no API key. If OpenCode can't be configured that way, the tests move behind an opt-in `FOREMAN_LIVE_OPENCODE=1` flag run by hand with a real provider, and the flag stays `false` until someone has done that and recorded the result.

The general test suite uses a fake `opencode` executable replaying the captured fixtures, so `bun test` needs no real OpenCode.

### Pipeline

The Pipeline is linear, declared in YAML and interpreted by the engine. The default ships in `policy/defaults.yaml` and implements the AIHero flow:

```yaml
pipeline:
  steps:
    - { id: grill,     scope: run,  access: read-only, prompt: grill }
    - { id: spec,      scope: run,  access: read-only, prompt: spec, produces: spec }
    - { id: tickets,   scope: run,  access: read-only, prompt: tickets, produces: tasks,
        gates: [{ type: human }] }
    - { id: implement, scope: task, access: write,     prompt: implement,
        gates: [{ type: evidence }, { type: diff-check }] }
    - { id: review,    scope: task, access: read-only, prompt: review, role: reviewer,
        gates: [{ type: review-verdict }] }
    - { id: retro,     scope: run,  access: read-only, prompt: retro, phase: after-completion }
  completion:
    - { type: integration }
    - { type: outbound, actions: [push, draft-pr] }
```

- **Gate types:** `human`, `evidence`, `diff-check`, `review-verdict`, `integration`, `outbound`, and `command` for custom checks. A `command` Gate runs in the scrubbed environment and passes on exit code 0.
- **System Steps:** `routing`, `lesson-extraction` and `policy-drafting` belong to the core. They're assignable in Model Assignment but not declared in the Pipeline.
- **Custom Pipelines:** Steps can be added, removed or re-prompted, provided that exactly one Step has `produces: tasks`. Removing an `evidence`, `diff-check`, `human` or `outbound` Gate, or changing a read-only Step to `write`, is a Relaxation.
- **Read-only Steps** run against a generated directory of detached, per-Project views at each `baseRef`, not in the Operator's checkouts. That way they can't see untracked secrets. After the Step, Foreman checks the views with git, and any modification fails the round, even if the Adapter claims read-only support.
- **Review verdict:** a review result is `{verdict: approve|changes, findings[]}`. It's a Gate input and isn't an Approval under the Safety Defaults.
- **Pinning:** a Run's Pipeline shape is fixed at the Run's start, and each new Task uses the Policy current when it starts (ADR-0056).

**State flow.** Run states are `running`, `waiting_human`, `halted`, `completed` and `abandoned`. A Task moves through the states below, each derived from the Ledger:

```text
pending → locked → implementing ⇄ waiting_input
  → verifying → reviewing → merging → verifying-integration → closed
Failure in verifying, reviewing or verifying-integration returns to implementing,
up to limits.maxRounds, then escalated.
```

A Step or Gate that waits on a human records the wait, then prompts inline if a TTY is attached. Otherwise the process exits with code `3`. Workers don't outlive the supervisor by design: on resume, a Worker whose session can be resumed is continued, and any other is salvaged under ADR-0029.

### Router

The flow follows ADR-0021 and ADR-0025:

1. The `tickets` Step drafts Tasks with scope and acceptance criteria.
2. The read-only `routing` Step returns each Task's Project, Role, dependencies and `contract: true` where the Task changes a contract.
3. Code validates that output: the Role may work on that Project, the scope is allowed, and the output is schema-valid. Invalid output gets the normal one corrective `send`, then the Run halts.
4. Code computes order from Task dependencies and confirmed Edges between the Projects involved. Unconfirmed Edges only produce warnings.

**Ordering rules (ADR-0026):**

- `shares-lib` and `depends-on`: every Upstream Task blocks every Downstream Task.
- `calls-api` and event Edges: the Upstream `contract: true` Task blocks the Downstream Tasks, and other Upstream Tasks may run in parallel with them. If the Upstream has no contract Task, its Tasks block as in the previous rule.
- If Tasks fall in a `calls-api` or event cycle, the Run pauses and asks the Operator for the order (ADR-0027).

**Impact.** When a `contract: true` Task has a direct Downstream Project with no Task in the Run, Foreman adds an Inbox notice before implementation starts. A Run across two or more Projects with no `integration.verify` command halts at routing, before any implementation tokens are spent.

**Answered by Router.** This is off by default. When enabled, a read-only Worker gets the question and the configured decision files, and must return an answer plus a verbatim citation. Code checks that the citation exists in a decision file; if it doesn't, the question goes to the Inbox. Questions tied to a Gate always go to the Inbox.

### Worktrees and branches

Each Task gets a worktree under its Run directory, on `foreman/<runId>/task-<taskId>`, branched from the Integration Branch `foreman/<runId>/integration` (ADR-0028). A Downstream Task's Integration Branch doesn't contain Upstream code, since they are separate repositories. It reaches that code through `FOREMAN_WORKTREE_<PROJECT>` and the optional `link` command.

- **Preparation:** per-Project `copyFiles` are checked against the deny list. If a *tracked* file in the checkout matches the deny list, the Task refuses to start and an Inbox item names the path. The Operator fixes the repository or adds an explicit exception.
- **Capture:** when a Worker finishes, Foreman commits anything uncommitted, excluding ignored files, so the verified SHA covers all the work.
- **Merge:** after review, Foreman merges serially into the Integration Branch, then re-verifies the merged SHA, since a clean merge can still break. Task Evidence must refer to that merged SHA. A conflict returns the Task to `implementing` with the conflict as its next instruction.
- **Cleanup:** worktrees stay until the Run is `completed` or `abandoned`, then are removed. Branches remain until the Operator deletes them.

### Task Locks and Ledger

Both follow ADR-0029, ADR-0030 and ADR-0031 in detail.

**Ledger line shape:**

```json
{"schemaVersion":1,"eventId":"…","at":"…","type":"action.pending","runId":"…","taskId":"…",
 "actionId":"…","kind":"push","generation":3,"data":{}}
```

Run and Task state come from a pure reducer over Ledger events. The Ledger stores no external text, only references and hashes, and all paths in it are Workspace-relative.

`maxActiveWorkers` is counted from unexpired Task Locks in the Workspace, so it holds across concurrent Runs. Since this is check-then-act it is a soft limit, while lock exclusivity itself stays hard.

**Reconciliation by action kind:**

| Action | How `foreman resume` decides |
|---|---|
| Worktree creation | Worktree exists at the expected branch |
| Worker start | Adapter `status`: resume, or cancel and salvage |
| Verification | Re-run; it has no outside effect |
| Merge to Integration Branch | Task SHA is an ancestor of the branch |
| Push | `git ls-remote` shows the expected SHA |
| Open PR | Remote lookup by head branch |
| Merge PR | Remote reports merged at the expected SHA |
| Deploy | Run the optional `deploy.check` command. Without one, the outcome is indeterminate: raise an Inbox item, never retry automatically |

An Approval remains valid for retrying the same `actionId` until the action is `done` or the Approval expires. That's consistent with single use, because reconciliation runs first and a retried `actionId` can't take effect twice.

### Verification

Verification runs the Project's `build`, `test` and `verify` commands in order and stops at the first failure. It uses the scrubbed environment and the configured Sandbox (ADR-0034). The Ledger records the command, exit code, output hash and SHA. Output goes to the Run's evidence directory with secret patterns redacted.

**Diff check** compares the Task's commits against its base using git:

- The diff is non-empty.
- Changed paths are within the Role's `paths`, and none are forbidden.
- There are no secret patterns. Default patterns ship in `policy/defaults.yaml`. Allowing one exact finding by its fingerprint and removing a pattern are both Relaxations.
- Deleted test files and newly added skip or only markers are flagged for the reviewer. Flags don't fail the Gate by themselves.

**Integration Verification** runs `integration.verify` after all Tasks are closed, with `FOREMAN_WORKTREE_<PROJECT>` set for every affected Project.

### Guard Policy and Check Engine

These implement ADR-0035, ADR-0036, ADR-0037 and ADR-0058.

**Check Engine.** Guard behaviour is `evaluate(checkpoint, facts, policySnapshot)`, which returns a decision of `allow`, `deny`, `flag` or `require-approval` and names the rule and Policy Layer that produced it. Decisions with effects are recorded in the Ledger. The code calls the engine at checkpoints such as `worktree.copy`, `worktree.tracked`, `scan.read`, `env.passthrough`, `diff.path`, `diff.content`, `task.close` and `outbound.<kind>`, and holds no deny list, credential name or secret pattern of its own. Rules look like this:

```yaml
guard:
  rules:
    deny-secret-files:
      checkpoints: [worktree.copy, worktree.tracked, scan.read, adapter.render, diff.path]
      match: { paths: [".env", ".env.*", "*.pem", "*.key"] }
      except: [".env.example", ".env.sample", ".env.template"]
      effect: deny
```

The Policy schema requires a rule set for every checkpoint, so a missing rule can't quietly mean "allow". Foreman stops if `policy/defaults.yaml` is missing or invalid.

**Safety Defaults for the guard**, all in `policy/defaults.yaml`:

- **Denied paths:** `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `.netrc`, `.npmrc`, `.pypirc` and the Workspace's `memory/`, with `.env.example`, `.env.sample` and `.env.template` excepted.
- **Denied command:** `foreman`.
- **Worker environment allowlist:** `PATH`, `LANG`, `LC_*`, `TERM`, `TMPDIR` and `HOME`.
- **Never passed through:** `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`, `SSH_AUTH_SOCK`, and any name that a Remote or deploy config declares as a credential.
- **Git settings in the Worker's environment:** `GH_CONFIG_DIR` set to an empty directory, `GIT_TERMINAL_PROMPT=0`, and `GIT_CONFIG_*` carrying `core.hooksPath`, which rejects pre-push and chains other hooks to the Project's own.
- **Adapter enforcement:** an Adapter with `enforcesPolicy: false` won't start without `allowUnenforced: true`. The opt-in is logged at each start and shown as a warning in `foreman status`.

Changing any of these is a Relaxation or a tightening like any other key.

**Set by the mechanism, not Policy.** Each Worker's environment is never inherited, and it always gets `FOREMAN_WORKER=1`, `FOREMAN_RUN_ID` and `FOREMAN_TASK_ID`, plus `FOREMAN_WORKTREE_*` for Projects in scope. `FOREMAN_WORKER` is what the Human Channel checks rely on, so it can't be removed.

**Foreman's own git use.** A Worker can edit a repository's shared git config and tracked hook directories, so anything Foreman runs must not execute them with its privileges. These are Safety Defaults under `guard.git`:

- Foreman's git commands override exec-capable config (`core.hooksPath`, `core.fsmonitor`, `core.sshCommand` and `core.pager`).
- Project hooks don't run during Foreman's approved pushes.
- Foreman records a hash of each repository's git config at the start of a Run. A change blocks Outbound Actions and raises an Inbox item.

**Sandbox.** `sandbox: bwrap` wraps Workers and verification commands in bubblewrap:

- The filesystem is read-only.
- The worktree and a temp directory are writable.
- The project's git directory is writable for commits, with its config and hooks mounted read-only.
- `HOME` is an empty tmpfs, and `memory/` isn't visible.
- An Adapter declares any read-only paths it needs, such as its stored auth.
- The network stays available, since agents need it.

If bubblewrap is missing or the platform isn't Linux, `sandbox: bwrap` fails validation rather than running unprotected.

### Approvals and the Outbound Executor

These implement ADR-0038 to ADR-0043, as amended by ADR-0051.

The **Outbound Executor** is the only code path that performs push, open PR, merge or deploy. For each action it:

1. Computes `actionId` from Run, Task, kind, target and head SHA.
2. Runs reconciliation and stops if the action is already done.
3. Loads the Policy current at this moment and records its hash on the action (ADR-0056).
4. Asks the Check Engine at `outbound.<kind>`, and acts on the decision: `require-approval` needs a valid Approval, `allow` proceeds, and `deny` refuses.
5. Performs any other Policy checks, such as an unchanged SHA and git config.
6. Appends `pending` and fsyncs, performs the action, then appends `done`.

Merge happens only through the Remote, and deploy runs the configured `deploy.command`.

**Safety Defaults for Outbound Actions**, all in `policy/defaults.yaml`:

- The Mode is `propose` for every repository.
- `push`, `pr`, `merge` and `deploy` all `require-approval`.
- In Autonomous Mode, the allowlist may contain `push` and `draft-pr`. Adding `merge` or `deploy` is a Relaxation, and valid once the Policy Owner has confirmed it.
- Pushes go to `foreman/*` by explicit refspec and are never forced. Widening either is a Relaxation.
- An Approval is invalidated by any change to the SHA and expires after 24 hours.
- `approvals.acceptAgentMessages` is `false`. If the Policy Owner sets it to `true`, a Worker's `foreman-approve` block can satisfy `require-approval` for an Outbound Action. The Ledger records this under the channel `agent-message`, and `foreman status` keeps warning about it. It never applies to a Policy Change.

**Local channel, `foreman approve`.** The command refuses unless all of these hold:

- It has a TTY, and reads the nonce from the terminal rather than stdin.
- `FOREMAN_WORKER` is absent from its environment and from every ancestor's environment. Reading ancestors' environments catches `env -u FOREMAN_WORKER foreman approve`. If ancestors can't be inspected, it refuses.
- The typed nonce matches. The nonce is random per invocation and is shown beside what's being approved: action, target, SHA and diff summary.

`foreman reject` and `foreman answer` also refuse under the Worker marker, but need no TTY.

**Approval sets.** `foreman approve <runId>` shows all of a Run's pending Outbound Actions in topological order, and one nonce covers that exact displayed list. Foreman records one Approval per action, each still bound to its own `actionId` and SHA, and executes them in order. A failure halts the remainder.

**GitHub channel.** This is opt-in. At startup Foreman reads its token's identity, and refuses to run if that login is on the approver allowlist. An Approval is a PR review in the `APPROVED` state whose commit ID matches the bound SHA, or a `/foreman approve <actionId>` comment that has not been edited, from an allowlisted account of type `User`. The Ledger stores the channel, alias and numeric ID only.

A GitHub Approval can only be given on an existing PR, so it covers actions on that PR: merge, a further push to its branch, and deploy tied to it. The first push and the opening of a PR need the local channel or an allowlisted Autonomous Mode. Foreman checks for GitHub Approvals on `foreman resume`, on `foreman poll` and while supervising.

The local channel's checks and the GitHub identity rule define what "authenticated" means, so they are part of the mechanism rather than Policy (ADR-0053).

### Policy

This section implements ADR-0051 to ADR-0059.

**What stays in code.** Only the mechanism: who can apply a Relaxation, the diff, confirmation, Ledger and revert path, and per-Task snapshots. Supporting these are Human Channel authentication, schema validation, Relaxation classification, Check Engine evaluation, the Ledger and locks, and the single Outbound Executor path. No Policy key can disable any of them. All rules are in Policy.

**Layers.** Effective Policy merges built-in, Workspace, Project and user override, with later layers winning. Maps merge deeply, and named rules merge by ID. A plain list in a higher layer replaces the lower one. `foreman policy show --explain <key>` names the layer that set a key. A policy file in a Project's repository is ignored.

**Policy Set and accepted state.** Foreman hashes the Policy Set: `policy/defaults.yaml`, everything in `foreman/` except the generated `graph.md`, and the user override. Each accepted Policy Set is stored as a content-addressed Policy Snapshot, containing the source files and the merged result. The Ledger's latest `policy.changed` event names the current accepted hash.

Foreman always runs from the accepted snapshot, never directly from files. A file that differs from it has no effect. Foreman reports the drift in `foreman status` and in an Inbox notice, and each command warns about it. A snapshot whose content doesn't match its hash in the Ledger stops Foreman with a clear error. A Workspace with no accepted snapshot runs on the built-in layer alone.

**Applying a change.** All routes end in the same path:

1. A candidate change is produced: from changed files (`foreman policy apply`), a drafted diff (`foreman policy apply --from <file>`, `foreman policy change`), a revert, `foreman init`, a Foreman upgrade or an approved Change Proposal.
2. Foreman merges and validates the result. Invalid Policy is refused as a whole, so no part of it applies.
3. Foreman classifies the change and shows the full diff. Each Relaxation is marked `RELAXATION`, with its before and after values, above the rest of the diff.
4. The change is confirmed:
   - A **Relaxation** needs a Human Channel: TTY and a nonce bound to the diff's hash, or GitHub as described below.
   - **Any other change** needs interactive confirmation, or `--yes`, which refuses Relaxations. This allows scripted tightening and neutral updates.
   - Every form refuses under the Worker marker, using the same environment and ancestor checks as `foreman approve`.
5. Foreman stores the snapshot and appends `policy.changed` with `changeId`, `origin` (`file-edit`, `natural-language`, `change-proposal`, `revert`, `init` or `upgrade`), channel, owner alias, time, why, before and after hashes, and the Relaxation key names.

The `why` is requested at confirmation and has secret patterns redacted. It's the one free-text field the Ledger stores, because it's the Policy Owner's own words. The user override appears only as the layer name, so its path can't leak a username.

**GitHub confirmation.** `foreman policy apply --from-pr <number>` applies when the Workspace's `foreman/` directory is versioned in a repository and the checkout's clean `HEAD` matches the head of that PR. The PR must have an `APPROVED` review at that exact commit from an allowlisted account of type `User` with `policyOwner: true`. Any other allowlisted reviewer can approve Outbound Actions but can't confirm a Policy Change.

**Natural-language changes.** `foreman policy change "<text>"` runs the read-only `policy-drafting` Step. The Worker gets the text, the current effective Policy and the schema, and returns a `foreman-result` containing structured key changes and unified diffs for free-text files, with base hashes. An invalid draft gets the usual one corrective `send`, and a second failure ends the command with nothing changed. A valid draft enters the path above at step 2, with the owner's text as the default `why`. The command refuses under the Worker marker.

The Foreman skill can run this command or write a draft file for `foreman policy apply --from`. The confirmation still happens on the Policy Owner's TTY.

**Hot reload and snapshots.** There's no daemon to restart. The supervisor reads the current accepted hash each time it starts a Task or a Step, so a change accepted in another terminal applies to the next one.

| Thing | Policy it uses |
|---|---|
| A Task, for its whole life, including rounds and resume | The snapshot from when it was locked, with the hash on its `task.locked` event |
| A new Task in an existing Run | The current accepted Policy |
| The Run's Pipeline shape | The snapshot from the Run's start |
| A Run-level Step | The current accepted Policy when the Step starts |
| An Outbound Action | The current accepted Policy when attempted, with the hash on the action |

To stop in-flight work under an old Policy, the Policy Owner uses `foreman abandon`.

**Classification.** Every leaf in the Policy schema is classified in code as `safety` or `neutral`, and each `safety` leaf has a direction:

| Kind of leaf | Relaxes when |
|---|---|
| Deny-style list (paths, patterns, never-pass names) | An entry is removed |
| Allow-style list (exceptions, passthrough, Mode allowlist, Role scope, allowlisted approvers) | An entry is added |
| Named rule | It's removed or disabled, or its effect moves towards `allow` |
| Ordered enum (Mode, sandbox, check effect) | It moves towards less protection |
| Boolean or number with a safe direction | It moves that way |
| Opaque value (verification commands, `deploy.command`, adapter `module`, Gates) | It changes at all |

Classification compares the merged result per Project, so moving a value between layers isn't a Relaxation in itself, and a higher layer can't hide one. A test fails if any schema leaf is unclassified, and at runtime an unclassified path counts as a Relaxation.

Safety-classified leaves include guard rules, secret patterns, `sandbox`, `allowUnenforced`, `env.passthrough`, Modes and allowlists, Approval settings, Gates, verification commands, Role `tools`, `projects` and `paths`, `lessons.minOccurrences`, `router.answerFromDecisions`, and adapter or remote `module` paths.

**Visibility.** `foreman status` and `foreman policy show --deviations` list every current difference from the Safety Defaults, with the layer and `changeId` that introduced it.

**History and revert.** `foreman policy history` reads the Ledger. `foreman policy revert <changeId>` restores the source files from the snapshot before that change, and goes through the path above as a new Policy Change with `origin: revert`. A revert that relaxes something needs a Human Channel, so reverting a tightening is treated as seriously as any other Relaxation. If later changes touched the same keys, Foreman shows the resulting diff rather than merging silently.

### Inbox and Polling

Inbox items are `question`, `gate`, `approval`, `notice` or `remote-event`. Answering is not approving: `foreman answer` can't satisfy a Gate.

Polling (ADR-0046) is off by default and read-only. It runs while supervising at `intervalSeconds`, or on demand through `foreman poll`. Each remote event is deduplicated by its stable ID. Text from authors outside the allowlist is withheld and only metadata is kept; bot comments are only counted. Allowlisted text is shown to the Operator but never injected into Workers. Polling has no code path to the Outbound Executor or the Pipeline Engine, other than recording a recognized Approval.

### Remote

```ts
interface Remote {
  identity(): Promise<{ login: string; type: "User" | "Bot" | "Other" }>;
  findPr(repo: RepoRef, head: string): Promise<PullRequest | null>;
  openPr(repo: RepoRef, input: OpenPrInput): Promise<PullRequest>;
  mergePr(repo: RepoRef, pr: number, expectedSha: string): Promise<MergeResult>;
  listApprovals(repo: RepoRef, pr: number): Promise<RemoteApproval[]>;
  listEvents(repo: RepoRef, cursor: string | null): Promise<EventPage>;
}
```

GitHub uses REST through `fetch` with `FOREMAN_GITHUB_TOKEN` from the Workspace's `.env`, and a configurable `apiBaseUrl` for GitHub Enterprise. Foreman doesn't shell out to `gh`. Other hosts are stubs. Git pushes use the Operator's existing git credentials rather than the API token, which keeps the token away from any git process.

### Prompts, locale and Worker context

Each prompt resolves in order: Workspace override for the locale, built-in for the locale, built-in English. Prompts ship in `prompts/en/` and `prompts/pt-BR/`. The locale changes prompts and interview text only; config keys, CLI commands and Ledger events stay in English.

A Worker's context is assembled in this order, within a token cap:

1. The Worker protocol: output blocks and limits.
2. The Step and Role prompts.
3. Context Files: `context.md` and notes for Projects in scope.
4. Lessons, in a fenced block marked as data, not instructions.
5. The Task and its acceptance criteria, or the spec.

If the cap is hit, Lessons are trimmed first, then Project notes. Trimming is logged. The protocol and the Task are never trimmed.

### Lessons

A Lesson record has `schemaVersion`, `lessonId`, `supersedes`, `fingerprint`, `symptom`, `rootCause`, `fix`, `detectionHint`, `scope` (Projects, stacks, Roles, Steps, file globs), `occurrences`, `confidence`, `status` (`candidate`, `active` or `rejected`), `origin` and references to its Runs. The store is append-only, and the latest record for a `lessonId` is current.

- **Capture.** When a verification failure is followed by a pass within the same Task, Foreman records a Lesson deterministically. `rootCause` is `"undetermined"` until enriched.
- **Extraction.** The read-only `lesson-extraction` Step enriches Lessons after any Task that had a failure, and at retro. Its output is schema-validated. Its failure raises a notice and never blocks a Run.
- **Fingerprint.** A SHA-256 of the failing command's category and error text, normalized to remove paths, line numbers, hashes, timestamps and numbers. Identical fingerprints merge: occurrences increment and scope is unioned.
- **Confidence.** Deterministic: 0.3 for one occurrence, plus 0.2 per further occurrence, capped at 0.9. Operator approval sets it to 1.0 and rejection to 0.
- **Activation.** A Lesson becomes `active` at `minOccurrences` (default 2) or by Operator approval. A rejected Lesson stays rejected even if the error recurs; occurrences still count, but it's never injected.
- **Redaction.** Secret patterns and home-directory paths are removed before storage.
- **Retrieval.** Deterministic, with no provider. Score is a weighted match on error fingerprint, then file globs, Project, stack, Role and Step, with ties broken by Confidence. The top `topK` within `tokenCap` are injected, and the Ledger records which Lessons went into which Worker.

Foreman auto-applies only Lesson store updates. Every update emits a Ledger event.

### Change Proposals

A retro or lesson-extraction result may include Change Proposals. Each has `proposalId`, `sourceLessons`, `targetKind` (`prompt`, `context`, `instructions`, `config`, `roles`, `pipeline`, `policies` or `code`), `targetPath`, a unified diff, the base file's hash, a rationale and a status.

**Before queuing, code checks:**

1. **Path containment.** The target must resolve inside `foreman/` or a Project, without following symlinks out. Paths in `memory/`, `.env`, the user override and Foreman's own installation directory, including `policy/defaults.yaml`, are rejected.
2. **Structured targets (`config`, `roles`, `pipeline`, `policies`).** The diff is applied in memory, the result is schema-validated, and Relaxations are classified as described under Policy. A proposal containing any Relaxation is rejected outright and logged as `proposal.rejected_relaxation`. It's never queued, while tightening and neutral changes are. The Policy Owner may still make that same change through `foreman policy` (ADR-0057). A new adapter or remote `module` path is the one exception: it queues as high-risk, always with human Approval (ADR-0014).
3. **Free-text targets.** These always queue, with an advisory warning if the text mentions skipping tests, approvals or guards. The warning is informational, because the guarantee comes from the Check Engine evaluating Policy.

**Approving** uses the same Human Channel rules, via the local channel. On apply, the base hash must still match; otherwise the proposal is marked stale and not applied. Targets in `foreman/` become a Policy Change with `origin: change-proposal`, so their history and revert work the same way. Targets in a Project go on a local branch `foreman/proposal-<id>` and then follow ordinary Outbound rules, so applying a proposal never pushes anything.

### Scanner

The Scanner follows ADR-0018 for coverage. It runs in-process, doesn't follow symlinks out of the repository, skips dependency and build directories, caps file size, and asks the Check Engine at `scan.read`. Under the Safety Defaults, its environment-URL heuristic therefore reads `.env.example` but never `.env`. Evidence stores the file, line and signal name, never the matched value, so internal hostnames don't end up in a versioned `workspace.yaml`.

**Edge detection:**

| Signal | Edge | Confidence |
|---|---|---|
| A manifest declares another Project's package or module name | `shares-lib` or `depends-on` | high |
| A compose `depends_on` between Projects' services | `depends-on` | high |
| An AsyncAPI document with matching publish and subscribe channels | `publishes-event`, `consumes-event` | high |
| A proto or OpenAPI file used by another Project, by path or generated client | `calls-api` | medium |
| An HTTP client plus an env URL key naming another Project | `calls-api` | low |

### Init

- **Interview.** A scripted question tree, one question at a time, with the recommendation accepted by pressing Enter. Text comes from the active locale. Each answer is saved to a draft answers file, so an interrupted interview can continue.
- **`--from <file>`.** Applies a schema-validated answers file with no prompts, and is the only write path, including for the skill (ADR-0017).
- **`--yes`.** Accepts all recommendations and fails if a required answer has none. It confirms only high-confidence Edges.
- **Determinism.** Output has stable ordering and no timestamps, so the same answers produce byte-identical files.
- **`--update`.** Rescans and regenerates `workspace.yaml` and `graph.md`. Confirmed Edges are never changed. New detections are added as `detected`, for review. A confirmed Edge whose evidence has gone is reported, not removed. `foreman.yaml`, `context.md` and notes are only created when absent, and the command reports suggested additions rather than editing them. The resulting change goes through the Policy path, so it's shown and confirmed.
- **Baseline.** The first `foreman init` records the first accepted Policy Snapshot. Answers can set any Policy value, but a Relaxation against the built-in defaults needs a Human Channel, including with `--from` and `--yes`. An agent running the skill can therefore prepare a Relaxation but can't apply it. Non-interactive init with relaxing answers fails, naming the keys.
- **Provider detection.** Runs `opencode models` when available, and checks for known environment variable names without reading their values. The Operator always confirms.
- **Skill.** The repository ships `.agents/skills/foreman-init/SKILL.md`, which runs the same interview adaptively in any agent, writes an answers file, and calls `foreman init --from`. It also covers later behaviour changes through `foreman policy change`. It tells the Operator that an agent session can't grant Approvals or confirm a Relaxation.

### Build and distribution

`bun run typecheck` runs `tsc --noEmit`. `bun run build` runs typecheck, then `bun build --target=bun` into `dist/` with built-in prompts and `policy/defaults.yaml` copied alongside. Operators use `bun link` for the `foreman` command, so Bun is a runtime requirement. A single compiled binary is deferred until local-module loading has been verified under it. Runtime dependencies are limited to zod and a YAML parser (ADR-0007).

### Deliverables

| File | Requirements |
|---|---|
| `README.md` | English: pitch, quickstart, architecture, safety model with limits stated plainly, roadmap including v0.2 dashboard, cost and difficulty routing, budgets, and an organization policy layer (enforced minimums) |
| `README.pt-BR.md` | The same sections in pt-BR |
| `LICENSE` | MIT, copyright "Foreman contributors" |
| `CONTRIBUTING.md` | Setup, tests, Adapter authoring, no personal data, no telemetry |
| `docs/spec.md`, `docs/tickets.md` or `docs/tickets/`, `docs/decisions.md`, `GLOSSARY.md` | As named |
| `.gitignore` | Covers real config paths, `memory/`, `.env`, `dist/` |
| `policy/defaults.yaml` | The built-in layer: the Safety Defaults, default Pipeline, guard rules and limits, valid against the schema |
| `config/foreman.example.yaml`, `config/workspace.example.yaml` | Valid against the schema, placeholders only |
| `config/lessons.example.jsonl` | Valid against the Lesson schema |
| `.env.example` | Placeholders only |
| `prompts/en/`, `prompts/pt-BR/` | One prompt per Step and system Step, plus the Worker protocol |
| `.agents/skills/foreman-init/SKILL.md` | The onboarding skill |
| `bun run scan` | The repository scan described below |

### Repository scan

`bun run scan` enforces ADR-0003 on the repository. It checks git-tracked files plus untracked files that aren't ignored, and exits non-zero on any finding. Each finding shows file, line and rule, with the matched value masked, so the report can't itself leak a secret.

- **Tokens:** GitHub (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), `sk-` style API keys, Slack `xox` tokens, AWS `AKIA` keys and private key headers. Each pattern requires a word boundary and a minimum length, so ordinary words such as "task-based" don't match.
- **Personal paths:** `/home/<name>`, `/Users/<name>` and `C:\Users\<name>`, apart from obvious placeholders.
- **Hostnames:** internal-looking names such as `*.local`, `*.internal` and `*.corp`, and private IP addresses.
- **This machine's identity:** the current `hostname`, `$USER` and git `user.name`, read at run time.
- **Personal names:** read from an optional, gitignored local denylist. The repository can't ship one, because a list of personal names would itself break ADR-0003.

A committed allow file lists accepted findings by file and rule, each with a reason. `--history` also scans past commits. Test fixtures build token-shaped strings at run time, so the repository's own scan stays clean.

The README safety model must state these limits:

- Foreman is safe by default, not safe by guarantee. Safety Defaults can be relaxed by the Policy Owner, so a Workspace's protection is whatever its Policy currently says. `foreman policy show --deviations` reports it.
- Each Safety Default is listed, with how to relax it and what relaxing it risks.
- Relaxations are flagged in the diff at confirmation, recorded in the Ledger and revertible.
- Without the Sandbox, the layers guard against mistakes, not a malicious Worker running as the same user.
- Such a Worker could read credential files in its home directory, forge a local Approval or Policy confirmation through a PTY, or tamper with `memory/`, including the Ledger and snapshots.
- Stored provider credentials stay reachable unless the Sandbox or a dedicated user is used.
- Operators shouldn't approve or confirm from inside another agent's session.
- `allowUnenforced: true` means relying on Foreman's remaining layers only.
- The user override has the highest precedence, so Policy isn't an organization-wide control. Anyone who can confirm on that machine can change it.

### Engineering decisions made in this spec

The owner delegated these, and they refine the ADRs without contradicting them:

1. **Fake Adapter is a fixture**, loaded through the local-module path, so the shipped CLI has no fake to select.
2. **Read-only Steps use detached per-Project views**, and their read-only status is checked with git after the Step.
3. **A tracked file matching the deny list blocks the Task**, since a worktree would otherwise contain it (a gap in ADR-0035 layer 1).
4. **Ancestor environment inspection fails closed**, which implements ADR-0039's Worker check without storing pids (ADR-0029).
5. **An Approval set uses one nonce for an exact displayed list**, while each action still gets its own bound Approval. Otherwise a five-Project Run would need ten separate nonces. This is the one reading of ADR-0039 that is worth the owner's review.
6. **The GitHub channel only covers actions on an existing PR.** There is nothing to review before a first push, which refines ADR-0040.
7. **Foreman's git commands disable exec-capable repository config, and a config change blocks Outbound Actions.** A Worker could otherwise plant code that runs with Foreman's privileges.
8. **Evidence binds to the merged SHA**, since verification of the pre-merge Task isn't proof of what ships.
9. **A multi-Project Run with no Integration Verification command halts at routing**, since the Run could otherwise never finish its completion Gate after spending on implementation.
10. **Deploy has an optional `deploy.check`.** Without it, an interrupted deploy's outcome is brought to the Operator, since deploys can't be reconciled in general.
11. **Unconfirmed Edges don't affect ordering.** Only confirmed Edges do, so a wrong guess can't reorder real work.
12. **Non-outbound human Gates use the same Approval path**, so there's one forgery-resistance mechanism to get right.
13. **GitHub uses REST with a configurable base URL**, for testability and GitHub Enterprise, rather than `gh`.
14. **Distribution is `bun link` and `dist/`**, not a compiled binary, in v0.1.
15. **Every Policy leaf is classified `safety` or `neutral` in code**, and an unclassified leaf fails a test and counts as a Relaxation at runtime, so a new option can't quietly bypass the check.
16. **Worker limits count live Task Locks**, as a soft Workspace-wide limit.
17. **A Worker timeout of 60 minutes** counts as a failed round.
18. **Foreman commits a Worker's uncommitted changes** after it finishes, so the verified SHA covers all of its work.
19. **Files alone never change Policy.** Foreman runs from the last accepted snapshot, so a hand edit needs `foreman policy apply`. A hand edit and a Worker's edit look the same on disk, and this is the only way to honour both "edit config" and "only the Policy Owner can relax" (ADR-0054).
20. **All of `foreman/` except `graph.md` is tracked Policy**, including prompts, Context Files and `workspace.yaml`, since Workers act on them and `workspace.yaml` holds verification commands. The cost is that editing `context.md` needs a quick confirmation.
21. **Tightening and neutral changes can use `--yes`; Relaxations can't.** This keeps scripted updates possible without weakening the Relaxation path.
22. **Outbound Actions use the Policy current when attempted**, not a snapshot, so a tightening can stop a pending push at once (ADR-0056).
23. **`approvals.acceptAgentMessages` is a real, working key**, as the owner made this a default rather than a lock. It covers Outbound Actions only.
24. **GitHub Policy confirmation is through a PR on the Workspace's own repository**, with reviewers explicitly marked `policyOwner: true` (ADR-0059).
25. **Project layers live in the Workspace.** A file in a Project's repository is untrusted and ignored.
26. **The scan's personal-name list is local and gitignored**, and its machine-identity check reads values at run time, so catching personal data doesn't require committing any.

## Acceptance Criteria

Each criterion must be demonstrated by a test unless marked otherwise. The test plan below maps these to scenarios. Unless a criterion says otherwise, it applies under the shipped Safety Defaults, and AC-96 proves that each one can be relaxed.

### Adapters

- **AC-1.** The contract suite passes against the fake Adapter and the OpenCode Adapter (using the fake executable).
- **AC-2.** Each stub declares `enforcesPolicy: false` and fails with a clear "not implemented" error.
- **AC-3.** An Adapter with `enforcesPolicy: false` refuses to start without `allowUnenforced: true`. With the opt-in it starts, logs that to the Ledger and shows a warning in `foreman status`.
- **AC-4.** The OpenCode Adapter ships `enforcesPolicy: false`. It can change only with the proofs in "OpenCode reference Adapter" passing and the tested version recorded.
- **AC-5.** A Worker receives exactly the built environment. A canary variable in the supervisor's environment is not visible to the Worker.
- **AC-6.** An Adapter that misreports its diff has no effect on Evidence.

### Pipeline and Router

- **AC-7.** The default Pipeline runs end-to-end on the fixture Workspace using the fake Adapter, from Intent to a completed Run.
- **AC-8.** A customized YAML Pipeline runs without any code change.
- **AC-9.** Each Gate type blocks when unmet and passes when met.
- **AC-10.** Invalid `routing` output gets one corrective message, then halts the Run. A Role assigned to a Project it isn't allowed on is refused.
- **AC-11.** In the fixture Workspace, Upstream Tasks complete first for `shares-lib` and `depends-on`, and the contract Task goes first for `calls-api` and events.
- **AC-12.** A `calls-api` cycle pauses for the Operator. A `depends-on` cycle fails validation.
- **AC-13.** A multi-Project Run with no integration command halts before any `implement` Worker starts.
- **AC-14.** A Downstream Worker receives the `FOREMAN_WORKTREE_<PROJECT>` of its verified Upstream.
- **AC-15.** A failed Task halts the Run, keeps its branches, and `foreman retry` and `foreman abandon` both work.
- **AC-16.** A Worker question appears in the Inbox, and `foreman answer` reaches the Worker. With `answerFromDecisions` enabled, a verified citation produces an answer logged as Answered by Router, and a fabricated citation goes to the Inbox.

### Worktrees and locks

- **AC-17.** Concurrent claimants in separate processes contend for one Task, and exactly one wins, repeatedly across many iterations.
- **AC-18.** A lock with an expired heartbeat can be taken over, and concurrent takeover attempts produce exactly one winner.
- **AC-19.** A lock with a live heartbeat can't be taken over.
- **AC-20.** A lost holder's Task-closing event with an old generation is refused.
- **AC-21.** After recovery, commits remain on the branch, uncommitted changes are in a saved patch, and the new Worker continues from the branch.
- **AC-22.** Parallel Tasks in one repository use separate worktrees, and their verified work combines on the Integration Branch.
- **AC-23.** A merge conflict returns the Task to a Worker rather than halting the Run.

### Verification

- **AC-24.** A Task can't close when a command fails, when a Worker claims success without Evidence, or when no Evidence matches its current SHA.
- **AC-25.** The Ledger holds the command, exit code, output hash and SHA for each verification.
- **AC-26.** The diff check rejects an empty diff, an out-of-scope path, a forbidden path and a secret pattern.
- **AC-27.** A deleted test and an added skip marker are flagged in the reviewer's input.
- **AC-28.** The reviewer is never the implementer's Worker. Three failed rounds escalate to the Inbox.
- **AC-29.** Evidence on the merged SHA is required. A merge that breaks tests reopens the Task.

### Approval and Safety Defaults

- **AC-30.** In Propose Mode, no Outbound Action happens without an Approval. A fake Remote and a local bare repository show no effect.
- **AC-31.** A Worker's message, a review verdict and an Inbox answer each fail to satisfy an Approval.
- **AC-32.** `foreman approve` refuses with no TTY, with a wrong nonce, under the Worker marker, and when only an ancestor has the marker (`env -u` from a marked process).
- **AC-33.** `foreman approve` succeeds with a real PTY and the right nonce.
- **AC-34.** Changing the head after Approval invalidates it. A used Approval can't be reused. An expired Approval is refused.
- **AC-35.** GitHub Approval is refused when the login isn't allowlisted, when the account is a `Bot`, when the commit doesn't match, or when a comment has been edited. An allowlisted human's correct review passes.
- **AC-36.** Foreman refuses to start with GitHub Approval enabled when its token identity is on the allowlist.
- **AC-37.** The Ledger holds the alias and numeric ID, and never the login.
- **AC-38.** Autonomous Mode permits only `push` to `foreman/*` and `draft-pr`, and merge and deploy require an Approval. Allowlisting merge or deploy in a file has no effect until confirmed as a Policy Change.
- **AC-39.** A push to a default branch or a forced push is refused in every Mode.
- **AC-40.** Each Safety Default holds under the shipped `policy/defaults.yaml`: Propose Mode, Approval before each of push, PR, merge and deploy, the `.env` deny, Evidence to close a Task, and agent messages not counting. Removing an outbound or evidence Gate is classified as a Relaxation.
- **AC-41.** Worker text, prompts and Lessons can't change a check's result, and a check keeps using the Task's Policy Snapshot when files on disk differ.
- **AC-42.** Every Policy schema leaf is classified `safety` or `neutral`, and an unclassified path counts as a Relaxation at runtime.
- **AC-43.** Foreman's own push doesn't run a hook planted by a Worker, and a changed git config blocks Outbound Actions.

### Guard Policy

- **AC-44.** A worktree contains no untracked `.env`. A `copyFiles` entry matching the deny list is refused, and a tracked denied file blocks the Task with an Inbox item.
- **AC-45.** A `.env.example` remains available, and `.env` stays denied until a confirmed Relaxation changes it.
- **AC-46.** A refused credential name in `env.passthrough` isn't passed to Workers, and a file edit adding one has no effect until confirmed as a Relaxation.
- **AC-47.** A Worker's `git push` is blocked by the injected hook, with no change to the repository's config.
- **AC-48.** Verification commands run in the same scrubbed environment as Workers.
- **AC-49.** With bubblewrap available, a sandboxed Worker can't read `.env`, `memory/` or a canary in `HOME`, and can write and commit in its worktree. When bubblewrap isn't available, `sandbox: bwrap` fails validation.

### Ledger and recovery

- **AC-50.** Every line has `schemaVersion` and `eventId`, and existing lines are never altered.
- **AC-51.** A torn final line is ignored and reported, and corruption elsewhere stops with a clear error.
- **AC-52.** Killing the process at each point around each action kind and then resuming produces no duplicate effect: one push, one PR, one merge.
- **AC-53.** After an interrupted push that did land, `foreman resume` records it done without pushing again. If it didn't land, it requires a valid Approval to retry.
- **AC-54.** An interrupted deploy with no `deploy.check` raises an Inbox item and doesn't run again.
- **AC-55.** With sentinel `HOME` and `USER` values, neither sentinel nor machine hostname appears in the Ledger or lock files, and paths there are relative.

### Learning

- **AC-56 (the owner's required test).** A repeated error produces a Lesson that is reused: in Run 1, a Task fails with error E and is then resolved, producing a candidate. Run 2 hits E again, the Lesson deduplicates to two occurrences and becomes active. Run 3's Worker context contains the Lesson in the fenced data block, and the Ledger records the injection.
- **AC-57.** Error text differing only in paths, line numbers, hashes or timestamps deduplicates into one Lesson.
- **AC-58.** Confidence follows the defined values. A rejected Lesson is never injected, even if the error recurs.
- **AC-59.** Secret patterns and home paths don't reach the store.
- **AC-60.** A Lesson that says "skip the tests" and is injected has no effect on Gates: a failing Task still can't close.
- **AC-61.** A Change Proposal removing a deny rule, enabling `allowUnenforced`, adding passthrough, widening a Role, weakening a Mode, removing a Gate or lowering `minOccurrences` is rejected, never queued, and logged.
- **AC-62.** A proposal targeting `memory/`, `.env`, the user override, a symlink out of bounds or Foreman's installation, including `policy/defaults.yaml`, is rejected.
- **AC-63.** `foreman proposals list`, `show`, `approve` and `reject` all work. An agent can't approve a proposal, for the same reasons as AC-32.
- **AC-64.** A proposal with a stale base hash isn't applied. An approved proposal targeting a Project lands on a local branch and pushes nothing.
- **AC-65.** Each Lesson and proposal event is in the Ledger.
- **AC-66.** Failure of the `lesson-extraction` Step doesn't block a Run.

### Workspace, config and init

- **AC-67.** The Scan over the fixture Workspace proposes the expected Edges with evidence, and doesn't execute anything: a planted `postinstall` and a planted script canary stay untouched.
- **AC-68.** The Scan doesn't read `.env`, doesn't follow a symlink out of the repository, and stores no matched values in evidence.
- **AC-69.** Each scanner stack in ADR-0018 has a fixture and detection test.
- **AC-70.** The scripted interview works with no model and no Adapter configured.
- **AC-71.** `--from` with the same answers gives byte-identical output on repeated runs.
- **AC-72.** `--update` preserves confirmed Edges and edited Context Files, adds new detections as `detected`, and reports confirmed Edges with missing evidence.
- **AC-73.** An interrupted interview resumes from its draft.
- **AC-74.** `graph.md` is valid Mermaid and contains every Project and Edge.
- **AC-75.** Unknown keys, bad references and wrong types each give an error naming the file, key and reason.
- **AC-76.** Model Assignment precedence resolves as defined, and a provider failure moves through only the explicit fallback list.
- **AC-77.** `config/foreman.example.yaml`, `config/workspace.example.yaml` and `config/lessons.example.jsonl` validate against their schemas.

### Remotes and polling

- **AC-78.** The GitHub Remote passes its contract suite against a local fake HTTP server, using a configured `apiBaseUrl`.
- **AC-79.** Polling is off by default. With it on, events deduplicate across repeated polls, text from unknown authors is withheld, and no event causes an Outbound Action or starts a Run.

### Locale and project quality

- **AC-80.** With `locale: pt-BR`, Workers get pt-BR prompts, the interview is in pt-BR, and a missing prompt falls back to English.
- **AC-81.** Every English prompt has a pt-BR counterpart, and both READMEs have matching section structure.
- **AC-82.** `bun test`, `bun run typecheck` and `bun run build` pass with no network, API keys, real OpenCode or GitHub access. The built `dist/` entry passes a smoke test.
- **AC-83.** Network use appears only in the Remote module, enforced by a static test. No telemetry exists.
- **AC-84.** `.env.example` and the example configs contain only placeholders, enforced by a test. All deliverables exist, and `LICENSE` is MIT with the required copyright.
- **AC-85.** The shipped CLI has no flag, environment variable or hidden option that bypasses the Human Channel, enforced by a test against its composition root and by the real-binary tests in AC-32.

### Policy

- **AC-86.** Effective Policy follows built-in < Workspace < Project < user override, named rules merge by ID, and `foreman policy show --explain` names the layer that set a key.
- **AC-87.** Rules live only in the defaults file: a static test finds no deny globs, credential names, secret patterns or default Mode values in source code. A missing or invalid `policy/defaults.yaml` stops Foreman with a clear error.
- **AC-88 (the owner's required test).** The Policy Owner relaxes a Safety Default through a confirmed diff. It takes effect for a new Task without a restart. The Ledger holds who (channel and alias), when, why, before and after hashes and the Relaxation key. `foreman policy revert` then restores the previous behaviour for the next new Task, as a new Ledger event.
- **AC-89 (the owner's required test).** An in-flight Task keeps its old Policy Snapshot after a Policy Change, including across `foreman resume`, while a new Task in the same Run uses the new one. Each Task's `task.locked` event has the Policy hash it used.
- **AC-90 (the owner's required test).** Agent attempts to relax are rejected. `foreman policy apply`, `change` and `revert` refuse under the Worker marker, including an ancestor-only marker. A Worker's direct edit of a Policy file has no effect and raises a drift notice. A relaxing Change Proposal is rejected. A comment asking for it does nothing. The Policy Owner can still make the same change afterwards.
- **AC-91.** A hand edit has no effect until `foreman policy apply`. A Relaxation needs a TTY and the right nonce, and refuses `--yes`, no TTY and a wrong nonce. A nonce covers one exact diff, so a file changed after display invalidates it. Tightening and neutral changes succeed with `--yes`.
- **AC-92.** `foreman policy change` uses the fake Adapter to produce a schema-valid draft and shows it, and nothing applies before confirmation. Declining leaves Policy unchanged. An invalid draft is refused as a whole. A draft containing a Relaxation is flagged and needs the Relaxation path, even when the text didn't ask for one. With no Adapter configured, the command fails clearly.
- **AC-93.** `foreman policy history` lists changes. A revert is a new event and never edits earlier lines. A revert that relaxes something needs a Human Channel.
- **AC-94.** Classification is correct for each kind of leaf in both directions, for a change introduced by a higher layer, and for moving a value between layers with no change to the result.
- **AC-95.** A Relaxation is marked prominently in the displayed diff, and `foreman status` and `foreman policy show --deviations` list every difference from the Safety Defaults, with its layer and `changeId`.
- **AC-96.** Each Safety Default can be relaxed by the Policy Owner, with an observable effect: an Outbound Action without an Approval for each of push, PR, merge and deploy, a Worker reading a `.env` canary, a Task closing without Evidence and recorded as such, and an agent message satisfying an Approval.
- **AC-97.** The mechanism can't be configured away. The schema has no key for it, and an attempt to add one is an unknown-key error. With `acceptAgentMessages: true`, a Worker's message still can't confirm a Policy Change or satisfy `foreman policy apply`.
- **AC-98.** `foreman init` records the first snapshot. Relaxing answers through `--from` or `--yes` fail without a Human Channel, naming the keys. A TTY confirmation applies them. `--update` changes go through the Policy path.
- **AC-99.** `--from-pr` applies only with an `APPROVED` review at the checkout's clean `HEAD` from a `policyOwner: true` account of type `User`. An allowlisted reviewer without the mark, a `Bot`, a different commit and a dirty checkout are each refused.
- **AC-100.** A tampered snapshot whose content doesn't match the Ledger hash stops Foreman. A Workspace with no accepted snapshot runs on built-in defaults alone and ignores its files. Changed built-in defaults, as after an upgrade, are shown as a change to confirm.
- **AC-101.** A policy file in a Project's repository is ignored, even if it uses the correct format.
- **AC-102.** A Policy Change's Ledger event holds only the layer name for the user override, and the sentinel check in AC-55 still passes.
- **AC-103.** A tightening accepted during a Run stops a not-yet-attempted Outbound Action, and the action records the Policy hash it used.

### Added during ticketing

- **AC-104.** `bun run scan` fails on a planted instance of each rule in "Repository scan", masks the matched value, doesn't match ordinary words such as "task-based", honours the allow file and the local denylist, and passes on this repository. `--history` finds a value that only exists in a past commit.
- **AC-105.** Provider detection during `foreman init` uses `opencode models` when available and environment variable names otherwise. A canary secret value in the environment never appears in any output, file or Ledger event, and the Operator confirms the result.

## Testing Decisions

### What makes a good test

A good test exercises external behaviour through the highest available seam and asserts what an Operator or auditor could observe: CLI output, exit codes, Ledger contents, files, git state and remote effects. It shouldn't assert internal calls. Temp git repositories are real git. Fake boundaries are limited to the agent, the Remote and the clock.

### Test seams

To keep seams few, tests use these, in order of preference:

1. **The application seam (primary).** `createApp(deps).exec(argv)` runs the same command handling as the shipped CLI, in-process. `deps` provides the clock, terminal I/O and Human Channel. Most scenarios use this with a temp Workspace, real git and the fake Adapter. Only the test suite ever injects a test Human Channel; the shipped entry point wires the real one and has no switch.
2. **The real-process seam.** Spawns the built CLI as a subprocess, for things that need a real process: crash tests with `SIGKILL`, the TTY and ancestor checks, concurrent lock contention and the build smoke test. The PTY success path uses `script`. If `script` isn't available the test skips and says so.
3. **The Adapter contract seam.** One shared suite against any non-stub Adapter.
4. **The Remote contract seam.** One shared suite, run against the fake Remote and against the GitHub Remote with a local fake HTTP server.

Pure logic with many edge cases gets direct tests through its module interface: graph ordering, Ledger reduction, Relaxation classification, layer merging, fingerprinting, Scanner detection. This repository has no prior tests, so these set the convention.

### Fixtures

- **Fake Adapter.** Plays a declarative scenario per Step and Task: edit files, commit or leave changes uncommitted, ask a question, fail, emit bad output, hang, misreport its diff, or attempt to read `.env`. It starts real child processes with the exact environment given, so environment scrubbing is really tested. It can declare `enforcesPolicy` either way.
- **Fake `opencode` executable.** Replays captured JSON output.
- **Fake Remote and fake GitHub HTTP server.** Scriptable identities, PRs, reviews, comments and events, with call recording.
- **Policy fixtures.** A temp user-override directory, so tests never read the real home directory, and an alternative `policy/defaults.yaml` to simulate an upgrade. Test Policy goes through the real Policy path, and tests that need a starting state confirm it through the test Human Channel.
- **Temp git repositories.** Each test materializes real repositories and a local bare repository to act as the push target.
- **Fixture Workspace.** A fake four-service Workspace under `tests/fixtures`, with manifests from multiple stacks. Its verify commands are small shell scripts, so no language toolchains are needed:
  - `shared-types`: TypeScript library. Upstream through `shares-lib`.
  - `catalog-api`: TypeScript service with an OpenAPI file. Uses `shared-types`.
  - `orders-api`: Python service. Calls `catalog-api`, publishes an event with AsyncAPI.
  - `notifier`: Go service. Consumes that event.
- **Scanner fixtures.** Minimal samples for each ADR-0018 stack, plus hostile cases: a `postinstall` canary, a `.env` canary, an escaping symlink.

### Test plan

| Area | Scenario | ACs |
|---|---|---|
| Contract | Shared Adapter and Remote suites | 1, 2, 78 |
| End-to-end | Intent to completed Run on the fixture Workspace, verifying order, Evidence, Integration Verification and the outbound set | 7, 11, 14, 22, 25, 30 |
| Pipeline | Custom YAML, each Gate blocking and passing | 8, 9 |
| Router | Bad routing, illegal Role, cycles, missing integration command, Router answers | 10, 12, 13, 16 |
| Halt | Failure, retry, abandon, conflict, three-round escalation | 15, 23, 28, 29 |
| Locks (process) | Contention, takeover race, live lock, zombie close, salvage | 17–21 |
| Verification | Failed command, false claim, stale SHA, each diff-check rule, flags | 6, 24, 26, 27 |
| Approval (process) | No TTY, wrong nonce, marker, ancestor marker, real PTY success | 32, 33, 63, 85 |
| Approval (app) | Non-human messages, binding, reuse, expiry, Approval sets | 31, 34 |
| GitHub Approval | Login, Bot, wrong commit, edited comment, identity collision, alias only in Ledger | 35–37 |
| Modes | Allowlist limit, default-branch and force-push refusal | 30, 38, 39 |
| Safety Defaults | Each default under shipped Policy, snapshot used over files on disk, leaf classification | 40–42 |
| Policy lifecycle | Layers, relax and revert end to end, in-flight snapshot, hand edit and drift, natural-language draft, classification, deviations report, `init` baseline, tamper and upgrade | 86–89, 91–95, 98, 100–103 |
| Policy authority (process) | Worker-marker refusals, Worker file edit, relaxing proposal, each default relaxed by the Policy Owner, mechanism not configurable, GitHub `--from-pr` | 90, 96, 97, 99 |
| Guard | Env canary, deny and copy rules, tracked secret, passthrough refusal, push hook, planted hook, config change | 3, 5, 43–48 |
| Sandbox | Real bubblewrap, skipped and reported if missing | 49 |
| Crash (process) | `SIGKILL` at each point around each action kind, then resume and count effects on the bare repository and fake Remote | 50–54 |
| Privacy | Sentinel `HOME` and `USER`, checked across the Ledger and locks | 55 |
| Learning | Three-Run repeated error, normalization, Confidence, rejection, redaction, poisoned Lesson | 56–60 |
| Proposals | Every relaxing change rejected, path attacks, CLI flow, stale base, Project-target branch, audit, extraction failure | 61–66 |
| Scanner | Each stack, hostile fixtures, expected graph | 67–69 |
| Init | No model, `--from` determinism, `--update` preservation, resume, Mermaid, skill-to-CLI path | 70–74 |
| Config | Error messages, Model Assignment, examples valid | 75–77 |
| Polling | Off by default, dedup, withheld text, no effects | 79 |
| Locale | pt-BR selection, fallback, parity | 80, 81 |
| Quality | Build and typecheck, offline, no telemetry, placeholders, deliverables | 82–84 |
| Repository scan | Each rule planted in a temp repository, masking, allow file, local denylist, history, this repository clean | 104 |
| Provider detection | Fake `opencode models`, env var names only, canary value | 105 |
| OpenCode (live or fake provider) | The "Required first proof" | 4 |

### Commands and environment

`bun test` is the required gate and needs no network, keys or external accounts. A test needing an optional tool (`bwrap`, `script`) skips with a visible reason rather than passing silently. Tests use real time only where the process seam requires it, with short TTLs. Otherwise they use the injected clock. Each test gets a fresh temp directory, so they can run in parallel.

## Out of Scope

- **Deferred to v0.2 (README roadmap):** dashboard, cost and difficulty routing, budgets, and an organization policy layer with enforced minimums (ADR-0060).
- **Hosted anything:** no SaaS, background service, accounts or telemetry.
- **Working non-reference Adapters:** T3 Code, Claude Code, Codex and Pi are stubs.
- **Working non-GitHub Remotes:** other hosts are stubs or roadmap items.
- **Starting Runs from remote events:** Runs start only from a local Intent.
- **Direct provider SDK calls:** all LLM use goes through Adapters.
- **Embeddings for Lessons.**
- **Non-linear Pipelines:** Steps run in sequence, with parallelism only among Tasks.
- **Automatic rollback** across Projects.
- **Windows** and network filesystems for `memory/`.
- **Mandatory sandboxing**, and sandboxes other than bubblewrap.
- **Signed Policy.**
- **A way to apply in-flight Policy to running Tasks:** the Policy Owner abandons and restarts instead.
- **Plugin marketplace** or auto-install.
- **Compiled single binary.**
- **Publishing:** no remote, package release or hosted repository during this work.

## Further Notes

- **Unverified at the time of writing:** OpenCode's actual deny-rule behaviour, its `--standalone` environment handling, its read-only mode, its JSON format, and whether a local fake provider can drive it. All are covered by the "Required first proof". The Adapter's safe starting state means a negative result reduces convenience, not safety.
- **Threat model honesty:** Foreman's layers are strong against agent mistakes and modest against a deliberately malicious Worker under the same user. Tests prove that each layer works. They don't prove that a same-user adversary can't get around it, and the README must not imply otherwise.
- **Corporate use:** with nothing hard-locked, a company can't impose a minimum through Foreman v0.1. It would need to control who can confirm on the machine, such as by running Foreman under a dedicated user. The README must say this rather than implying Policy is a compliance control, and point to the organization policy layer on the v0.2 roadmap (ADR-0060).
- **Implementation order for tickets:** the mechanism modules have the highest cost of error, so tickets should build them with their tests before anything relies on them. Build the Ledger first, then Policy and the Check Engine, then Locks, Human Channels and the Outbound Executor, then the Pipeline Engine. No ticket may add a hardcoded behaviour rule: each one reads its rules from Policy, and each checkpoint it adds comes with its Safety Default in `policy/defaults.yaml` and its leaf classification. `docs/tickets` will set the exact order.
- **Development process:** implementation happens locally in small verifiable commits, with no remote (ADR-0010).
