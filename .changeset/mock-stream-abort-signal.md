---
"@runtypelabs/persona": patch
---

The testing module's `createMockSSEStream` / `createMockSSEResponse` accept an optional `signal` (pass the `RequestInit.signal` a `customFetch` receives). Once the signal aborts, reads reject with `AbortError`, matching real fetch behavior, so cancel/clearChat during a mock stream tears the turn down instead of letting the client's read loop keep consuming frames after the session was cleared.
