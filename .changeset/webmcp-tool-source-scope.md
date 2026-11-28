---
"@runtypelabs/persona": patch
---

Keep WebMCP discovery and execution scoped to the current document on registries that expose the spec's `Tool.source` (Chrome 160+, `@w3c/webmcp-polyfill` 0.2.0). Persona previously read only the pre-rename `window` member, so on those registries same-origin tools from parent and sibling frames reached the snapshot and same-name dispatch. Tools whose registering document is gone (`source === null`) are now excluded too, and `null` input schemas and annotations from the `Tool` interface are typed and handled.
