---
'@runtypelabs/persona': patch
---

An approved tool call no longer flashes "Approved, ran again below" before its real result appears. The server now runs the paused call itself under its original id, so the widget waits until the resumed stream ends and settles the paused bubble only if no result arrived for it (older servers that re-issue the call under a new id still get the superseded settle).
