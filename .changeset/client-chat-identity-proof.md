---
"@runtypelabs/persona": patch
---

Add `identityProvider` to forward fresh `getIdentityProof` tokens on client-token chat requests without requiring history. Refresh proofs on retries, stop requests when proof retrieval fails, and redact proofs from debug logs.
