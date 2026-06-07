---
"@runtypelabs/persona": minor
---

Trim the CDN/IIFE bundle by excluding dev-only helpers.

The dev/demo-only helpers `generateCodeSnippet` and `createDemoCarousel` are no longer bundled into the IIFE/CDN build (`index.global.js`), making it smaller. A running widget never needs them — they are build-time / config-tool utilities. The barrel was split into `index-core.ts` (shared API, used by the IIFE) and `index.ts` (npm entry, which re-adds the two helpers).

This change is invisible to a running widget — no styling, behavior, or functional change.

- **npm consumers:** no change — `generateCodeSnippet` and `createDemoCarousel` are still exported from `@runtypelabs/persona`.
- **Script-tag / CDN consumers:** `window.AgentWidget.generateCodeSnippet` and `window.AgentWidget.createDemoCarousel` are no longer exposed on the global. These are dev-only tools never used by a live widget.
