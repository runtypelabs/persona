---
"@runtypelabs/persona": patch
---

Shrink the CDN bundle by removing duplicated implementations: the WebMCP single-call resolver now delegates to the batch resolver, the composer mic button uses the shared composer-parts factory instead of a verbatim copy in ui.ts, and the tool/reasoning bubbles share one expandable-bubble chrome module (emitted DOM is byte-identical). The theme-plugin factories (`accessibilityPlugin`, `animationsPlugin`, `brandPlugin`, `reducedMotionPlugin`, `highContrastPlugin`, `createPlugin`) move to npm-only exports: they are config-time helpers with no runtime caller, so the script-tag `window.AgentWidget` global no longer exposes them (same rule as `generateCodeSnippet`); npm imports are unchanged.
