# Durable setup memory

## Storage boundary

Select the actual workspace memory root with the operator; the Foreman source repository is not automatically the destination for a company's context. Paths below are relative to that chosen root.

Use `orchestrator/` for records the operator has classified as safe to version. For confidential records choose a separately protected local/private store; `orchestrator/private/` is an ignored option in the Foreman repository, not a security mechanism. Verify ignore rules in the chosen repository before writing private material. Never put credentials or secret values into memory. Ignore rules do not untrack previously committed files or prevent a forced add.

A public context index may link to a sanitized logical record identifier in the private store, not reveal confidential project names, paths or findings. Private records will require a separate authorized transfer on another computer; Git clone will not copy ignored files. Confirm that trade-off during setup.

## File ownership

| Path | Authoritative content | Read condition |
| --- | --- | --- |
| `AGENTS.md` | Workspace-specific entry pointer, roles and operating restrictions | Session start; preserve existing instructions |
| `orchestrator/context.md` | Product purpose, users, journeys, current state, outcomes, constraints and links to detailed records | Every Router session |
| `orchestrator/workspace.md` | Complete source catalog: stable repository identity, responsibilities, domain ownership and T3 project/environment binding references | Every Router session and task routing |
| `orchestrator/projects/<slug>.md` | One source repository's role, stack, domain concepts, interfaces, observed commands and conventions; target/reference classification | Tasks or research touching that project |
| `orchestrator/dependencies.md` | Typed project relationships, critical information flows, evidence and uncertainty | Cross-project impact analysis or ordering |
| `orchestrator/knowledge.md` | Evidence index, research report references and observations not owned by a project or dependency record | Verify a finding or recover research context |
| `orchestrator/decisions.md` | Human decisions, authority, rationale and links to architectural ADRs | Resolve intent or a trade-off |
| `orchestrator/status.md` | Worker assignments, task/implementation state, evidence and next actions | Coordinate or recover work |
| `orchestrator/setup.md` | Setup scope/state, interview frontier, gap register, completed research and confirmation checkpoint | Initialize, update or resume setup |
| `orchestrator/history.md` | Chronological index of consequential discussions, corrections and lessons, linked to their owning records | Session bootstrap and explaining why context changed |
| `orchestrator/handoff.md` | Latest session checkpoint, memory coverage and unresolved continuation steps | Session end and next startup |

Private versions retain these logical owners in the agreed private store. Do not create parallel competing copies. Existing records are merged, not overwritten wholesale; conflicts require reconciliation. Create per-project files only for registered sources, using unique portable slugs.

## Minimal shapes

### Setup progress

```text
Setup scope / workspace memory root (safe reference):
Storage classification / approved source scope:
State: interviewing | researching | awaiting-confirmation | partial | ready
Topics answered (links to owning records):
Pending questions: ID / prerequisite / question / owner / next action
Research assignments: issue / Worker link / source / state
Gaps: ID / missing or conflicting information / blocking scope /
      evidence needed / owner / next action
Last confirmed synthesis / operator response reference:
Last update:
```

`ready` applies only to the explicitly confirmed scope. `partial` means usable context exists but blockers or deferred questions remain. If an update invalidates a confirmed fact, reopen its gap and reconsider readiness.

### Workspace catalog

```text
Workspace identity / confirmed product scope:
Catalog confirmation source / date:
For every source:
  Stable source ID / canonical repository identity / aliases:
  Target or read-only reference:
  One-line responsibility / owned domains and capabilities:
  Project note reference:
  T3 project and environment binding reference / last verified:
  Local location mapping (private when necessary):
  Access state / allowed scope / unresolved mapping:
```

Register every repository, including inaccessible or not-yet-understood sources as gaps. The catalog is the routing index; detailed findings stay in project notes. A source slug, folder name or matching keyword is insufficient proof of a T3 project binding. Verify actual tool/project information before launch and after changing computers. Worker thread assignments belong in status, not in a second catalog.

### Project note

```text
Source ID / target or reference / access scope:
Purpose and product responsibility:
Owned domains / supported capabilities / explicitly excluded responsibilities:
Source revision / observed date:
Stack and manifests:
Relevant domain concepts and flows:
Interfaces provided / consumed:
Build/test/verify commands (observed, not assumed executed):
Conventions / forbidden areas:
Evidence references:
Hypotheses / gaps:
```

### Dependency record

```text
Relationship ID / source project / target project:
Type: depends-on | calls-api | shares-lib | publishes-event | consumes-event
Direction meaning / contract or information exchanged:
Evidence: revision + file/symbol or document section:
State: observed | proposed | operator-confirmed | disputed
Impact / ordering implications:
Gaps / last verification:
```

Direction must be explicit, especially for event producers/consumers. A matching name or nearby directory alone does not prove a relationship. Cycles are recorded as cycles and require an integration strategy, not a fabricated linear order.

### Knowledge entry

```text
Finding ID / topic / concise claim:
Classification: observed | reported-by-human | hypothesis | unknown
Source: repository revision + path/symbol, public URL + section,
        or human response reference
Observed date / verification status:
Owning record or safe report reference:
Contradictions / limitations / next verification trigger:
```

Store detailed claims at their owner; the knowledge index links to them. Preserve uncertainty and evidence references rather than copying raw repository content or full transcripts into memory.

### Discussion history entry

```text
Entry ID / timestamp / originating question, thread or issue reference:
Type: answer | correction | rationale | finding | lesson | scope-change
Consequential point / why it matters:
Authority / evidence / uncertainty:
Owning record updated / superseded entry if any:
Remaining gap / next action:
```

After a material conversation or Worker return, persist the durable fact/decision at its owner and add a history reference before treating that context as available for later work. Capture rejected alternatives when their rationale affects future decisions. A decision record, not history ordering alone, determines which decision is current. Sensitive material follows the selected storage boundary.

### Session handoff

```text
Workspace / Router session reference / checkpoint time:
Core records and project summaries read / missing or inaccessible:
Material discussions and results captured through (safe source reference):
Dirty or unsynchronized memory / transfer limitations:
Active work, pending questions and decisions (links to owning records):
Unresolved context gaps / continuation priorities:
Next startup action:
```

The checkpoint is a recovery index, not a copy of the context or a completion guarantee. Capture material events incrementally rather than waiting until session end: a crash can prevent the final handoff. If a durable write fails, flag unsaved context and block dependent coordination until recovered.
