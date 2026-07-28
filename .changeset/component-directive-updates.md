---
"@runtypelabs/persona": patch
---

Fix component-directive updates: `ComponentContext.updateProps` now works in the transcript, and equal-length directive changes re-render.

- **`updateProps` was a no-op in the thread.** The transcript's directive render call omitted `onPropsUpdate`, so a renderer that called `context.updateProps` got silence. It is now backed by `session.updateComponentDirectiveProps(messageId, props)` (also public): props merge shallowly into the message's directive, are written back to `rawContent` so the change survives re-renders, persistence, and hydration, and the resulting render rebuilds the component with them.
- **The message fingerprint hashed `rawContent` by length.** Two directives differing only in a same-width value (`"status":"waiting"` → `"status":"running"`) fingerprinted identically, so the transcript served the stale bubble from cache and the component never re-rendered. `rawContent` is now hashed with a single-pass djb2 over its bytes.

A rebuild replaces the mounted subtree, so any live runtime state inside it — an iframe's session, a canvas, a media element — is recreated. Components that own such state should still render once and mutate their own DOM rather than calling `updateProps`; `data-preserve-runtime` protects them from idiomorph, not from an intentional props update. The fingerprint fix does not change that: it makes rebuild-driven flows correct rather than length-dependent.

Also adds `webmcp.toolTimeoutMs` to override the WebMCP bridge's per-call 30s cap on a page tool's `execute()`. The default suits tools that return promptly; a tool that deliberately waits on a person (a human-in-the-loop browser handoff, where `execute()` stays pending until the user finishes signing in) needs minutes, and under the fixed cap the agent was resumed with a timeout error while the user was still working.
