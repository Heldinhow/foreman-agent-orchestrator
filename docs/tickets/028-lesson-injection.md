# 028: Lesson retrieval and injection

**Goal:** A repeated error is avoided because the next Worker is told about it. This ticket holds the owner's required learning test.

**Blocked by:** [017: Prompts, locale and Worker context](017-prompts-context.md), [027: Lesson store and capture](027-lesson-store.md)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] **AC-56:** in Run 1, a Task fails with error E and is resolved, producing a candidate. Run 2 hits E again, the Lesson deduplicates to two occurrences and becomes active. Run 3's Worker context contains the Lesson in the fenced data block, and the Ledger records the injection.
- [ ] **AC-60:** a Lesson saying "skip the tests" that gets injected has no effect on Gates, so a failing Task still can't close.
- [ ] Retrieval is deterministic, weighted by fingerprint, then file globs, Project, stack, Role and Step, with ties broken by Confidence, within `topK` and `tokenCap`.

## Tests

- The three-Run scenario at the app seam with temp repositories.
- A retrieval ranking table.
- The poisoned Lesson with a failing verify command.
