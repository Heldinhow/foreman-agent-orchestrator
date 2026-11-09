# Setup interview

Use the grilling approach: map a decision tree, ask the currently answerable frontier, then recompute it from each response. Start from existing records; ask for corrections where evidence may be stale instead of repeating settled questions.

## Frontier

Cover these branches as they become relevant:

- **Product:** problem, users, core journeys, value, current maturity and desired outcomes.
- **Scope:** target projects versus read-only references, ownership, permitted changes and forbidden areas.
- **Relationships:** responsibilities, shared concepts, upstream/downstream contracts, data/event flows and integration points.
- **Constraints:** compatibility, security/privacy, delivery requirements, conventions and nonnegotiable behavior.
- **Operation:** available T3 providers/models and human gates, verification expectations, persistent storage and access from another computer.
- **Direction:** existing commitments, known pain points and success criteria. Product strategy is not inferred from code alone.

Ask a numbered question with the recommendation and rationale, where a recommendation is justified. Phrase it so “yes” accepts that recommendation. Group only independent questions; questions requiring unanswered prerequisites wait for a later round. Keep rounds small enough for useful answers rather than issuing a comprehensive questionnaire up front.

Facts available from permitted repository inspection belong to Worker research, not human guesswork. Human priorities, access scope and trade-offs belong to the operator. Use evidence to explain why a new question matters.

## Authority and routing

If the Router conducts setup directly, it asks the operator about unresolved decisions. If an independent Worker runs the interview or `grill-with-docs`, its questions go to the Router under the coordination skill's grill procedure. The Router supplies known context and escalates what it cannot answer. Record the actual source of the answer.

The frontier is never silently emptied by guessing. Every open question is answered, explicitly deferred with its impact, or blocked with an owner/next action in `orchestrator/setup.md`. Operator confirmation closes shared understanding; an agent's synthesis alone does not.
