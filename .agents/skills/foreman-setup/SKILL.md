---
name: foreman-setup
description: Set up Foreman workspace context when onboarding a product, adding target or reference repositories, filling initial knowledge gaps, or updating an existing setup.
license: MIT
compatibility: Requires T3 Code independent-thread tools for repository research and an operator-accessible durable workspace.
---

# Foreman setup

The Router runs the interview and maintains coordination documents. Independent T3 Workers perform repository research under `foreman-t3-coordination`; use that skill for assignments, questions and returns. Use the ordered steps below for setup or setup updates. This skill does not implement a CLI command.

## 1. Locate memory and authority

Read `references/memory.md`. Confirm the workspace root, operator, allowed projects/paths, public versus private storage and permission to inspect each source. Read existing context, decisions, status and setup progress before asking again.

Register one or more source repositories as **target** (potential implementation scope) or **reference** (read-only research). Record stable identifiers and sanitized locations; repository access does not imply permission to change it. Unresolved source access is a named gap.

**Done:** the operator has confirmed the workspace, storage/privacy boundary and research scope; existing records have been recovered. If confirmation is missing, ask before scanning or publishing context.

## 2. Interview the frontier

Read `references/interview.md`. Ask only questions whose prerequisites are settled. Use known records as candidate answers with sources, not as unquestioned current facts. Distinguish product decisions for the human from repository facts for research.

Capture product purpose, users, critical journeys, current state, outcomes, project responsibilities, information/dependency flow, constraints and operating conventions. Keep unanswered items in the setup gap register.

**Done:** each relevant topic is answered with provenance, assigned to bounded research, or explicitly unresolved with an owner and next action. Research-dependent questions wait for findings; they are not answered by assumption.

## 3. Research the sources

Read `references/research.md` before assigning read-only research to independent Workers. Provide each with the confirmed scope and a self-contained brief. Reconcile their findings and questions through the coordination skill, then revisit the interview frontier exposed by those findings.

**Done:** every registered repository has an evidence-backed summary or an access blocker, and each proposed relationship is evidenced or marked as a hypothesis. Research questions have been answered or retained as gaps.

## 4. Consolidate durable context

Use the file ownership and record shapes in `references/memory.md`; keep one authoritative home for each finding. Store observed facts, hypotheses and human decisions separately. Link summaries instead of duplicating detailed reports. Update setup progress after each material answer or research return so interruption does not restart the interview.

**Done:** every registered source has a catalog entry linking its identity, responsibility, project note and verified or unresolved T3 binding. Product context, dependencies, evidence and gaps are reachable from the index. Material interview/research outcomes are captured in their owning records and history; the privacy boundary is preserved.

## 5. Validate shared understanding

Present the operator with a concise synthesis: product goals and users, project responsibilities, critical dependency/information flows, constraints, conflicting findings and unresolved gaps. Ask for explicit confirmation or corrections. If a gap blocks intended coordination, retain a partial setup rather than declaring readiness.

Before declaring readiness, use the coordination skill's bootstrap procedure to check that another Router can recover the recorded understanding and distinguish the sources without this interview's chat history.

**Done:** confirmed scope and remaining limitations are recorded. Mark setup `ready` only when no blocking gap remains for that scope; otherwise record `awaiting-confirmation` or `partial` with next actions. A partially understood workspace is not authorization to begin implementation.

## 6. Resume and evolve

For a resumed setup, changed repository or stale finding, read `references/maintenance.md`. For a requested roadmap, use its roadmap branch.

**Done:** changed evidence and decisions are reconciled, affected gaps reopened and the index updated. Future task briefs receive the relevant current context plus known gaps, not a claim of complete knowledge.

## Review

For skill authoring or acceptance checks, read `references/acceptance.md`. Runtime tool definitions and repository approval rules remain authoritative.
