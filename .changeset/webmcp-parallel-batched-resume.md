---
"@runtypelabs/persona": minor
---

WebMCP: support parallel local-tool calls. When one model turn makes several `step_await(local_tool_required)` calls for a single paused execution — including two PARALLEL calls to the **same** tool (e.g. "add SHOE-001 and SHOE-007 to my cart") — the widget now executes each page tool concurrently (each gated by its own native approval bubble) and posts a **single** `/resume` whose `toolOutputs` are keyed by the per-call `toolCallId` (runtypelabs/core#3878) instead of one resume per tool keyed by tool name. Same-tool parallel calls previously collided on the name key and raced on `/resume`, hanging the turn after the first tool. Single-call and distinct-tool turns are unchanged (name-keying remains the fallback for servers that don't emit `toolCallId`).
