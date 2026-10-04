---
"@runtypelabs/persona": minor
---

Shrink the npm ESM/CJS entries from about 215 kB to 180 kB gzip. The SSE stream processor, visitor-history REST, history shell, approval and local-tool resolve paths, opt-in UI glue and the Runtype TTS engine are no longer inlined: they load on demand through new package subpaths (`./client-stream`, `./client-history`, `./ui-extras`, `./session-actions`, `./history-shell`, `./runtype-tts`), which bundlers code-split. Tool and reasoning bubbles move into a new lazy `./activity-ui` chunk that the widget warms on first panel render, which also takes about 5 kB off the CDN bundle. The public API is unchanged.
