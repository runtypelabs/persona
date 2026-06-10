---
"@runtypelabs/persona": patch
---

Reduce bundle sizes: stop inlining the full package.json into every bundle (a named JSON import tree-shakes it down to the version field, ~1.4 kB gzip off each bundle), and stop shipping the WebMCP polyfill inside the CDN bundle (~10 kB gzip off index.global.js). The polyfill now builds as a standalone lazy chunk (`dist/webmcp-polyfill.js`) that the IIFE bundle imports on demand — only when `config.webmcp.enabled` is true and the page has no `document.modelContext` yet — from a URL derived from the widget script's own `src`. npm/bundler consumers are unaffected (their bundlers keep resolving the bare dynamic import). Self-hosted deployments that rename `index.global.js` and rely on Persona to install the polyfill should install `@mcp-b/webmcp-polyfill` on the page themselves. Size budgets ratcheted down accordingly (CDN 180→161 kB, ESM 141→140 kB, CJS 142→141 kB) with a new 11 kB budget for the chunk.
