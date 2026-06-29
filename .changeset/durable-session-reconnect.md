---
"@runtypelabs/persona": minor
---

Add durable-session reconnect for resumable agent turns: any long-running, server-persisted execution whose stream carries an SSE `id:` cursor (e.g. Claude Managed agents, or async/background agent runs). When a streaming connection drops mid-turn (tab reload, sleep, network blip, stream timeout), the widget now reads the SSE `id:` cursor, detects a non-graceful drop (vs. a finish or an intentional pause), and auto-reconnects with bounded backoff to replay the missed frames and keep filling the same assistant message instead of finalizing a truncated answer.

New config: `reconnectStream` (host-owned reconnect transport, symmetric to `customFetch`), `onExecutionState` (surface the resume handle for persistence), `resume` (boot-time tab-reload resume), and `reconnect` (backoff tuning). New `paused`/`resuming` statuses with `statusIndicator.pausedText` / `resumingText` copy, `stream:paused` / `stream:resuming` / `stream:resumed` controller events, and a `controller.reconnect()` manual retry. Self-gating: reconnect only arms on the durable lane (streams carrying `id:` lines); every other stream finalizes on drop exactly as before.
