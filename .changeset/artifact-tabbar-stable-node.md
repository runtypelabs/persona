---
"@runtypelabs/persona": patch
---

Artifact pane: a `renderTabBar` (Seam A) hook may now return the same element across invocations and the pane skips remounting it. This lets a custom tab bar keep its internal state (notably a `createRovingTablist` keyboard focus) across selection changes; returning a fresh element per call detached the subtree and broke Arrow-key navigation after the first press.
