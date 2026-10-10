---
"@runtypelabs/persona": patch
---

Support host-installed WebMCP polyfill v5 and v6 with a single, non-retried tool invocation. Preserve the v5 automatic fallback, browser support, callback-result behavior, and legacy custom-loader initializer. Scope tool discovery to the current document so related-frame tools cannot collide with name-only dispatch. Add integration tests against both published runtimes; update producer demos to v6 independently.
