---
"@runtypelabs/persona": minor
---

Add previewable file artifacts for Claude Managed agents. When a markdown artifact carries optional `file` metadata (path + mimeType), Persona recovers the raw source from the fenced wire content and can preview HTML/SVG in a sandboxed `<iframe srcdoc>` (opaque origin, `allow-scripts` by default, never `allow-same-origin`), render markdown through the usual pipeline, or show source. The artifact pane exposes a rendered/source toggle for previewable files, cards show the file type and basename, and downloads use the real filename, MIME type, and unfenced content. Configurable via `features.artifacts.filePreview` (`enabled`, `iframeSandbox`). Fully additive and backward compatible: artifacts without `file` behave exactly as before.
