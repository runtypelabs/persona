---
"@runtypelabs/persona": minor
---

Add `features.artifacts.inlineBody.viewMode` (`"rendered"` | `"source"`). `"source"` makes inline artifact blocks always show raw syntax-highlighted source instead of a rendered preview, covering html/svg file previews, markdown-kind files, and plain markdown artifacts alike. This is the no-preview mode for hosts where the artifact is input to the host system (a code editor, a query runner) rather than something to render. Component artifacts still render through the registry. Default `"rendered"` keeps existing behavior.
