---
"@runtypelabs/persona": minor
---

Add configurable loading animations and text templates for tool call and reasoning bubbles. New `loadingAnimation` display option (`pulse`, `shimmer`, `shimmer-color`, `rainbow`) provides visual feedback during tool execution and reasoning. Text templates (`activeTextTemplate`, `completeTextTemplate`) support `{toolName}` and `{duration}` placeholders with inline formatting syntax (`~dim~`, `*italic*`, `**bold**`). The `renderCollapsedSummary` callback for both tool calls and reasoning now receives `elapsed` and `createElapsedElement()` for custom renderers to display live-updating duration.
