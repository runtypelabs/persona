---
"@runtypelabs/persona": minor
---

Add `webmcp.requireConfirmFor` and honor a Runtype surface's WebMCP confirm policy. A page tool whose bare name matches a pattern always asks for confirmation: `autoApprove` is skipped, the voice read-only fast tier no longer bypasses it, and a custom `onConfirm` receives `info.confirmRequired: true`. In client-token mode the patterns from `/v1/client/init` (`config.webmcp.requireConfirmFor`, the surface's `behavior.webmcp.requireConfirmFor`) are merged with the widget's own list and exposed on `ClientSession.config.webmcp`. This is client-side UX, not a security boundary.
