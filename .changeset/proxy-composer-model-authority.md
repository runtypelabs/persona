---
"@runtypelabs/persona-proxy": minor
---

Add explicit transport authority for the widget's composer selections.

`createChatProxyApp` gains `composerModels: { allowed: string[] }` and `forwardComposerModes`. The widget's `composerOptions` is stripped before the upstream call unless a route opts in. With `composerModels`, an allowlisted `selectedModelId` is applied to the definition the proxy owns locally: the `agentConfig` model, or the enabled `flowConfig` steps that declare one. Routes pinned by `agentId` or `flowId` resolve their model server side and are left alone. A disallowed model is ignored, never rejected. With `forwardComposerModes`, active mode ids ride along as `context.composerModes`.
