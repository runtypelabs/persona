---
"@runtypelabs/persona": patch
---

Shrink the CDN bundle (`index.global.js`) further, from 145.7 to 129.4 KiB Brotli (184.8 → 163.6 kB gzip), by loading code that only runs after something happens from lazy sibling chunks next to `index.global.js`: the SSE stream processor and approval / resume requests (`client-stream.js`, fetched in parallel with each request), visitor-history REST and the history shell (`client-history.js`, `history-shell.js`), the approval / ask-user-question / WebMCP resolve paths (`session-actions.js`), the ask-user sheet handlers and context-mention orchestrator (`ui-extras.js`), and voice wiring (`voice-runtime.js`). Self-hosted CDN deployments must serve these files alongside `index.global.js`. npm (ESM/CJS) consumers keep everything bundled and registered up front.
