---
"@runtypelabs/persona": minor
---

Export the action-system types from the package root: `AgentWidgetActionHandler`,
`AgentWidgetActionHandlerResult`, `AgentWidgetActionParser`, `AgentWidgetParsedAction`,
`AgentWidgetActionContext`, and `AgentWidgetActionEventPayload`. These back the public
`actionHandlers` / `actionParsers` config options but were previously unexported, so
consumers authoring custom action handlers or parsers could not type them by name.
