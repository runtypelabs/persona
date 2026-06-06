---
"@runtypelabs/persona-proxy": patch
---

Forward WebMCP `clientTools[]` to the upstream API in flow-dispatch mode. The proxy rebuilds the flow-dispatch payload from scratch, which previously dropped the page-discovered tools the widget snapshots from `document.modelContext` — so a WebMCP-enabled flow behind the proxy never received them and the agent could not call page tools. The flow path now copies `clientTools` through (agent mode already forwarded the payload as-is), pairing with the existing `/resume` endpoint to complete the local-tool round-trip.
