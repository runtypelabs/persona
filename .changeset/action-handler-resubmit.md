---
"@runtypelabs/persona": minor
---

Add resubmit flag to action handler results for automatic model continuation

- Add `resubmit?: boolean` to `AgentWidgetActionHandlerResult` type
- Add `action:resubmit` event to `AgentWidgetControllerEventMap`
- When a handler returns `resubmit: true`, automatically trigger another model call
- Enables handlers that inject data (e.g., search results) to have the model analyze and respond to that data
