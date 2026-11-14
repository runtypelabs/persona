---
"@runtypelabs/persona": minor
---

Script-tag installs load faster, with nothing left to fetch when the launcher is clicked.

- The launcher bundle now carries the part of `widget.css` its own markup uses, so the launcher paints without waiting for the stylesheet: 20.0 KiB Brotli before it appears, down from 37.7 KiB.
- Once the launcher is up, the installer warms everything the first open and first message need (the stylesheet, the main bundle, and the lazy chunks the configuration uses), so the click and the first send run from cache instead of fetching chunks afterwards. This now works in Safari too. Visitors with `Save-Data` or a 2G-class connection are only warmed when they reach for the launcher.
- Inline, docked and auto-expanded installs request the stylesheet, the bundle and their chunks together instead of one after another.
- A stylesheet that fails to load on open is reported as `onError({ phase: "css" })` and retried on the next click.

`window.AgentWidgetLauncher` gains `installCriticalStyles()`. No configuration changes are needed.
