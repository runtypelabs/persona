---
"@runtypelabs/persona": minor
---

Add a Messages scene to the theme editor preview. `PreviewScene` gains `"messages"`: the scene enables the conversation history feature on the preview widget (panel presentation unless the config chooses otherwise) and the packaged preview renderer opens the Messages view after mount. Hosts supply a provider via `setHistoryProviderFactory`; without one the scene degrades to a plain conversation.
