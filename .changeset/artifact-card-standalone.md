---
"@runtypelabs/persona": minor
---

Artifact reference cards now render standalone in the thread instead of nested inside a message bubble, matching how Claude.ai and other AI experiences present artifact cards. Components can opt out of bubble chrome via `componentRegistry.register(name, renderer, { bubbleChrome: false })`. The card's corner radius now follows the assistant bubble radius by default and can be themed independently via `--persona-artifact-card-radius`.
