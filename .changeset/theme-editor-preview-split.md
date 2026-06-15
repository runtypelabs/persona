---
"@runtypelabs/persona": minor
---

Split `@runtypelabs/persona/theme-editor` into a headless core (~30 kB gzip) and a new `@runtypelabs/persona/theme-editor/preview` subpath for `createThemePreview` (mounts the full widget). Import preview helpers from the headless path; import `createThemePreview` from `./theme-editor/preview` instead of `./theme-editor`.
