---
"@runtypelabs/persona": minor
---

Add an optional `@runtypelabs/persona/smart-dom-reader` entry point for richer host-page
DOM parsing. It exposes `createSmartDomReaderContextProvider()` (drop into
`config.contextProviders`), `collectSmartDomContext()`, and the pure mapper
`smartDomResultToEnriched()`, adding Shadow-DOM piercing, form grouping, and page
landmarks/state over the default `collectEnrichedPageContext` reader. Both the collector
and provider accept a `root` element to scope extraction to a subtree (parity with the
default reader's `root`). The backing
library (`@mcp-b/smart-dom-reader`, MIT) is vendored and bundled only into this opt-in
entry, so the main bundle and IIFE/CDN build are unaffected. Also re-exports the
`AgentWidgetContextProvider` / `AgentWidgetContextProviderContext` types from the public API.
