# 027: Lesson store and capture

**Goal:** When a verification failure is later resolved, Foreman records a Lesson, and repeats of it build up as one Lesson the Operator can manage.

**Blocked by:** [002: Ledger](002-ledger.md), [020: Task execution loop on one Project](020-task-loop.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-57:** error text differing only in paths, line numbers, hashes or timestamps deduplicates into one Lesson.
- [ ] **AC-58:** Confidence follows the defined values, and a rejected Lesson is never injected, even if the error recurs.
- [ ] **AC-59:** secret patterns and home paths don't reach the store.
- [ ] `foreman lessons list`, `show`, `approve` and `reject` work.
- [ ] The store is append-only, with `schemaVersion` and `supersedes`, and every update emits a Ledger event.
- [ ] A Lesson activates at `minOccurrences` or by Operator approval.

## Tests

- Fingerprint table of normalized variants.
- Fake Worker fails then passes within a Task, producing a candidate.
- Redaction with planted secret-shaped values built at run time.
