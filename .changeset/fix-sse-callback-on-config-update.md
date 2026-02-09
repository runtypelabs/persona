---
"@runtypelabs/persona": patch
---

Fix SSE event stream callback lost on config update. `session.updateConfig()` was creating a new `AgentWidgetClient` without preserving the `onSSEEvent` callback, causing the Event Stream Inspector to show 0 events after any `controller.update()` call (e.g. theme changes).
