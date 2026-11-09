# Foreman: T3-native direction

Status: owner-confirmed direction; replacement specification and ticket plan are not yet written. Authority: ADR-0067 in `decisions.md`.

## Product

Foreman is a reusable set of instructions, policies, documentation and persistent memory for coordinating work inside T3 Code. It is not a separate coding-agent runtime.

```text
Human operator
    |
Router thread in T3 Code <--> Workspace documents and persistent memory
    |
    +-- Worker thread: planning / specification
    +-- Worker thread: implementation (own worktree where needed)
    +-- Worker thread: verification / review
```

Every Worker is an independent T3 Code thread. The Router uses T3's native thread tools, not its own subagents, to assign and follow work. The diagram describes responsibilities, not a prescribed number of threads.

## Router responsibilities

- Understand the intent, Workspace domain, project relationships and constraints.
- Record context and decisions; maintain durable coordination memory.
- Send scoped briefs to independent Worker threads with the necessary context.
- Track thread links, status, blockers, outcomes and next actions.
- Escalate unresolved decisions and human approvals.
- Recover ongoing work after a session restart from persistent records.

The Router does not implement product code, run engineering verification or perform the Workers' engineering tasks itself. Maintaining coordination documents and memory is allowed and necessary.

## Worker responsibilities

Workers perform the assigned engineering work in their own T3 threads and contexts. Worktrees isolate repository changes where appropriate. A Worker reports findings, changes, verification evidence and unresolved issues; its message is not human authorization.

Provider/model configuration is a T3 thread concern. Foreman no longer needs an agent-adapter framework to launch separate coding-agent runtimes.

## Persistent memory contract

Durable records must cover Workspace context, decisions and their rationale, active work and Worker thread links, blockers, verification references, lessons and next actions. A new Router session must be able to reconstruct coordination state from these records without pretending it retains previous chat history.

The file layout, onboarding procedure, update protocol, recovery rules and enforcement mechanisms still need specification. Prompts alone do not enforce access restrictions. Preserve human approval requirements and do not claim isolation guarantees without verifying the T3 mechanisms involved.

## Migration

1. Write a replacement specification and tickets for instructions, memory, thread coordination, recovery and onboarding.
2. Inspect relevant T3 capabilities before choosing tooling or claiming enforcement guarantees.
3. Validate Router instructions and memory templates with independent Worker threads and a restart/recovery scenario.

The previous runtime and backlog were removed; Git history retains historical context. No new runtime implementation is authorized by this document alone.
