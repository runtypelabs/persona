---
"@runtypelabs/persona": minor
---

Suppress the resume affordance for auto-resuming durable pauses. The unified `await` SSE event now carries an `awaitReason` discriminator (`crawl_pending` / `durable_poll`, open-ended for forward-compat). When it is present, the server resumes the stream itself, so the widget renders a passive, non-interactive "working in the background" indicator (a new `"pause"` message variant) instead of a resume/input control, and settles it once the stream resumes. Awaits without `awaitReason` (local-tool / WebMCP) keep today's interactive behavior unchanged. Indicator copy is overridable via `config.copy.durablePauseLabels`.
