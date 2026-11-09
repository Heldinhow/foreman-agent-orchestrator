# Grill conversation

During `grill-with-docs`, the Worker asks its delegating Router. Use the question record in `protocol.md` and the send rules in `threads.md`.

## Worker asks

Send the issue, Worker link, stable question ID, context, recommended answer when useful and the dependent decision. Keep that decision unsettled until the answer arrives; unrelated work may continue.

**Done:** delivery is recorded and the question is awaiting the Router, or delivery is pending under `recovery.md`.

## Router answers or escalates

Check relevant context and decisions. Answer when the source is known and the answer is within the Router's authority. Cite that source to the originating Worker.

For missing knowledge, conflicting decisions or insufficient authority, record the question as awaiting-human and ask the human. Preserve its identity and Worker destination. Repeated delivery of the same question reuses its record rather than creating another escalation.

**Done:** a sourced answer has been sent, or the human question and next action are recorded. Silence is not an answer; a Router inference is not a human decision or gated approval.

## Close the loop

Record consequential answers and their sources in the decision record; maintain pending status until the answer reaches the Worker. Relay the human's answer to that Worker, not merely to a generic project conversation. The Worker incorporates the answer into its grill documents and reports the affected document references.

**Done:** answer provenance, delivery and document incorporation are recorded, or the remaining step stays pending with an owner and next action.
