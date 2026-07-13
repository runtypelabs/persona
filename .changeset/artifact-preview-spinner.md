---
"@runtypelabs/persona": minor
---

Artifact file-preview loading: replace the text-only "Loading preview…" overlay with an icon-first indicator. The default is now a themeable pure-CSS spinner (no text), with a calm work-naming label ("Starting preview…") that fades in only as an escalation after `labelDelayMs` (default 2s) — icon-first per HIG/Geist/Sandpack, and reduced-motion aware. New `filePreview.loading` options: `label` (string or `false` for icon-only forever), `labelDelayMs`, and `renderIndicator` (full indicator override with a null-falls-back contract). Theming layers via new CSS vars: `--persona-artifact-spinner-size`, `--persona-artifact-spinner-color` (falls back through `--persona-accent` → `--persona-primary`), `--persona-artifact-spinner-track-color`, and `--persona-artifact-spinner-speed`. The reusable `persona-spinner` class is exposed for other surfaces.
