# 004: Check Engine

**Goal:** Every behaviour decision comes from one engine that reads rules from Policy and can say which rule and layer produced it, so no rule needs to live in code.

**Blocked by:** [003: policy/defaults.yaml and Policy Layers](003-policy-layers.md)

**Status:** done

## Acceptance criteria

- [x] `evaluate(checkpoint, facts, policySnapshot)` returns `allow`, `deny`, `flag` or `require-approval`, naming the rule and layer.
- [x] **AC-87:** a static test finds no deny globs, credential names, secret patterns or default Mode values in source code. A missing or invalid `policy/defaults.yaml` stops Foreman with a clear error.
- [x] **AC-41 (part):** the result depends only on the checkpoint, facts and snapshot, with no input from Worker text or prompts.
- [x] The schema requires a rule set for every checkpoint, so a missing rule can't mean "allow".

## Tests

- Table of checkpoints and facts against the shipped defaults, including `.env.example` allowed and `.env` denied.
- A rule added in a higher layer changes the decision and is named in the result.
- The static test fails against a planted hardcoded rule in a fixture source file.
