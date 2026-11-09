# Foreman

Foreman takes an intent and drives an engineering process across one or more related projects, using coding agents as pluggable workers under human control.

## People and agents

**Owner**:
Whoever decides what the Foreman project itself becomes.
_Avoid_: maintainer (for design authority)

**Operator**:
The authenticated human who runs Foreman for a Workspace and can grant Approvals.
_Avoid_: user, owner (for this role), admin

**Router**:
The part of Foreman that turns planned work into ordered, assigned Tasks and decides what runs next.
_Avoid_: orchestrator, lead, manager

**Worker**:
One coding-agent session carrying out one Step or one Task on Foreman's behalf.
_Avoid_: agent (for the running session), subagent, thread

**Adapter**:
The plug that lets Foreman drive one kind of coding agent as a Worker.
_Avoid_: driver, connector, integration

**Role**:
A declared specialization, such as backend or reviewer, that sets a Worker's Adapter, model, prompts, allowed tools and allowed Projects.
_Avoid_: worker profile, persona, agent type

## Workspace

**Workspace**:
The set of related Projects that Foreman operates on together, along with their configuration, context and memory.
_Avoid_: monorepo, organization, tenant

**Project**:
One repository, or one declared part of a repository, that Foreman can change and verify.
_Avoid_: service, repo (when the concept is meant)

**Workspace Graph**:
The Projects of a Workspace and the typed Edges between them, confirmed by the Operator.
_Avoid_: dependency tree, architecture map

**Edge**:
A typed relationship from one Project to another: depends-on, calls-api, shares-lib, publishes-event or consumes-event.
_Avoid_: link, relation

**Upstream**:
The Project on the providing side of an Edge.
_Avoid_: parent, provider

**Downstream**:
The Project on the consuming side of an Edge.
_Avoid_: child, consumer

**Context Files**:
Human-editable descriptions of the Workspace and its Projects that every Worker receives.
_Avoid_: memory, system prompt, notes

**Scan**:
A read-only inspection of Projects that suggests configuration and Edges without executing anything.
_Avoid_: discovery, indexing, analysis

**Model Assignment**:
The mapping from a Step or Role to a provider, model, variant and explicit fallbacks.
_Avoid_: routing (for model choice), model config

## Work

**Intent**:
The Operator's request that starts a Run.
_Avoid_: prompt, ticket, job

**Run**:
Everything Foreman does to carry out one Intent, across all affected Projects.
_Avoid_: session, workflow execution, job

**Pipeline**:
The declared sequence of Steps and Gates that a Run follows.
_Avoid_: workflow

**Step**:
One stage of a Pipeline, such as grill, spec, tickets, implement, review or retro.
_Avoid_: phase, stage

**Task**:
The smallest unit of work a Worker can lock, scoped to one Project and one Role.
_Avoid_: ticket, issue, subtask, job

**Task Lock**:
An exclusive, expiring claim on a Task that survives restarts and can be recovered once abandoned.
_Avoid_: lease, reservation, assignment

**Integration Branch**:
The Foreman-owned local line of work where a Run's verified Tasks combine within a repository.
_Avoid_: staging branch, release branch

## Control

**Gate**:
A condition that must hold before a Run moves past a point in its Pipeline.
_Avoid_: check, approval (a Gate may not need one)

**Evidence**:
The record of what Foreman itself observed when verifying a Task, tied to the exact code it verified.
_Avoid_: proof, worker report, test claim

**Integration Verification**:
Verification of a Run's combined changes across its affected Projects.
_Avoid_: end-to-end test, system test

**Outbound Action**:
An action that leaves the local machine or touches a protected line of work: push, PR, merge to a default or protected branch, or deploy.
_Avoid_: side effect, publish

**Approval**:
A human's authenticated, single-use authorization of one exact Outbound Action or Change Proposal.
_Avoid_: LGTM, ok, confirmation

**Human Channel**:
A route that Foreman trusts to carry an Approval because it authenticates a human.
_Avoid_: approval source, message channel

**Mode**:
The per-repository setting, Propose or Autonomous, that says which Outbound Actions need an Approval.
_Avoid_: proposal (for this setting), autonomy level

**Propose Mode**:
The default Mode, where every Outbound Action waits for an Approval.
_Avoid_: dry run, shadow mode

**Autonomous Mode**:
The opt-in Mode, where allowlisted low-risk Outbound Actions proceed without an Approval.
_Avoid_: auto mode, YOLO mode

**Safety Floor**:
The rules that no configuration, prompt, Lesson or Change Proposal can relax.
_Avoid_: guardrails, defaults

**Guard Policy**:
What a Worker is denied, including secret files and credentials.
_Avoid_: sandbox, permissions

**Sandbox**:
Optional operating-system isolation around a Worker and its verification commands.
_Avoid_: Guard Policy, worktree

**Inbox**:
The place where questions, requests for Approval and surfaced remote events wait for the Operator.
_Avoid_: queue, notifications

**Answered by Router**:
A Worker's question resolved from an already recorded decision and logged as such, which is never an Approval.
_Avoid_: auto-approval, answered on the Operator's behalf

## Record

**Ledger**:
The append-only record of what Foreman intended to do and what it did, from which a Run can be resumed and audited.
_Avoid_: log, history, journal

**Reconciliation**:
Comparing the Ledger with actual state after an interruption, so unfinished actions are resolved rather than blindly repeated.
_Avoid_: retry, replay, sync

**Remote**:
A system outside the local machine that hosts a repository and its reviews.
_Avoid_: forge, origin (for the concept)

## Learning

**Lesson**:
A structured record of a resolved problem: symptom, root cause, fix and detection hint.
_Avoid_: memory, insight, note

**Occurrence Count**:
How many times the same Lesson has been observed.
_Avoid_: frequency, hits

**Confidence**:
How far Foreman trusts a Lesson, based on its occurrences and human review.
_Avoid_: score (alone), certainty

**Change Proposal**:
A suggested change to instructions, prompts, config, the Pipeline, policies or code, derived from Lessons and awaiting an Approval.
_Avoid_: proposal (alone), propose mode, suggestion
