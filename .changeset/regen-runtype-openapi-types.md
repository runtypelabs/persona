---
"@runtypelabs/persona": patch
---

Regenerate the Runtype OpenAPI contract types to match the current public API spec. Adds visitor/identity fields to client init (`identityProof`, `visitorToken`, `visitorHistory`, `conversationId`), `conversationId`/`conversationRevision`/`visitor`/`app`/`targetId` on the init response, a `requests[]` array and `externalAgent` on await events, `stepErrorCount` on execution completion, and `displayContent` on chat request messages.
