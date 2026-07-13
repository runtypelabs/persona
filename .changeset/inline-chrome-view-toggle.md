---
"@runtypelabs/persona": minor
---

Add a rendered/source view toggle to the inline artifact chrome. On complete file-backed markdown artifacts that have a rendered alternative to their source (previewable HTML/SVG, or markdown-kind files), the inline block now shows a per-block icon button that flips the body between the preview and the raw highlighted source, cross-fading the swap. Default on; availability-gated (hidden while streaming, for plain markdown / component / source-only "other" files, when `filePreview.enabled: false`, and when `inlineBody.viewMode: "source"` forces a source-only body). Opt out with `features.artifacts.inlineChrome: { showViewToggle: false }`.
