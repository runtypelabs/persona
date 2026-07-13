---
"@runtypelabs/persona": minor
---

Add a loading overlay for the sandboxed file-preview iframe. Previewable HTML/SVG artifacts that pull CDN scripts (React/Babel) no longer flash blank before content paints: a themed "Loading preview…" overlay covers the pre-paint area and dismisses the instant the content signals it has rendered (an injected `postMessage` ready reporter), with delayed appearance, a minimum-visible window, a fade-out, and a hard timeout. The iframe now sits in a positioned `persona-artifact-frame` wrapper, gets `color-scheme: light` plus a themeable `--persona-artifact-frame-bg` background to remove the opaque-canvas white flash. Configure via the new `features.artifacts.filePreview.loading` option (`delayMs` / `minVisibleMs` / `timeoutMs` / `injectReadySignal`), or `loading: false` to opt out entirely (raw srcdoc, prior behavior).
