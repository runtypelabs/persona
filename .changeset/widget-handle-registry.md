---
"@runtypelabs/persona": minor
---

Add `getAgentWidgetHandles()`: a registry of every mounted `initAgentWidget()` handle, oldest first, deregistered on `destroy()`. `persona:chat-ready` is a one-shot broadcast and `windowKey` is opt-in, so host code created after a widget mounted previously had no way to reach it. Late companions (selection toolbars, host integrations) can now adopt the most recent mount via `getAgentWidgetHandles().at(-1)` — importable from the package, or `window.AgentWidget.getAgentWidgetHandles()` on CDN builds.
