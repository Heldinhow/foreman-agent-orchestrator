# Durable workspace context

## Purpose

Foreman coordinates engineering through a Router thread and independent Worker threads in T3 Code. The Router maintains context and directs work; it does not perform the Workers' engineering work. See `AGENTS.md` and `docs/t3-native.md`.

## Repository state

This repository contains an incomplete TypeScript implementation of the earlier standalone-runtime design. Preserve it as historical material until the replacement specification determines what to retain. The previous spec and implementation ticket plan are frozen, not an active backlog.

## Process

Agree with documentation, write the replacement specification, create GitHub tickets, then implement through independent T3 Worker threads. Code changes require a PR and verification. Agents do not grant human approval.

## Memory and portability

The files in `orchestrator/` are the versioned, sanitized coordination memory. Record decisions, implementation status and Worker returns here so a new Router can recover context. Never commit secrets or confidential workspace details. Git clone transfers committed records, not machine-local T3 sessions or worktrees.

## Setup contract

Workspace onboarding and updates use `.agents/skills/foreman-setup/SKILL.md`. Its `references/memory.md` is authoritative for setup outputs, per-project/dependency records and the evidence index. Determine the actual workspace and privacy boundary before populating those records; this source repository does not yet contain a completed workspace interview or research dataset.

## Unresolved design work

- Replacement specification and acceptance criteria.
- Actual T3 thread communication and enforcement capabilities.
- Live validation of recovery, onboarding and knowledge retrieval.
- Migration of any useful behavior from the superseded runtime.
