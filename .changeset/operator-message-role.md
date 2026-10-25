---
"@runtypelabs/persona": minor
---

Add the `operator` UI role for human replies on the assistant side, with its own theme tokens, readable accessible author label, optional structured author provenance and custom message actions, including attachment-only replies. Preserve provenance through injection, custom history and persistence.

Keep operator messages out of model requests by default for backends that own conversation history. Add the synchronous `modelMessageTransform` hook so stateless adapters can explicitly convert human contributions into attributed model context once in chronological order. Prevent retry and edit operations from truncating human operator replies.
