---
"@runtypelabs/persona": patch
---

Fix output throughput tracking and the testing assistant-turn helper to consume and emit the supported unified stream vocabulary. Recoverable errors no longer stop throughput tracking, and execution completion uses current token and duration fields. Remove obsolete flow/step error and step-await approval handlers, update stream inspector badge mappings while preserving existing theme tokens, and replace legacy test fixtures and demo streams with unified events. Existing public configuration aliases, exports, and the custom-backend dispatch_error extension remain supported.

Refresh the generated Runtype contract with the current upstream optional subagent metadata and context_notice event.
