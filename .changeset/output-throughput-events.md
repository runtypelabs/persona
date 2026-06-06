---
"@runtypelabs/persona": minor
---

Add an output throughput (tok/s) metric to the Events diagnostics screen. Throughput is derived passively from the existing SSE event stream — estimated live from visible text deltas and finalized from exact provider usage on terminal `flow_complete` / `agent_complete` events — and shown as a compact "Output throughput" summary row: the tok/s value is the headline, with the supporting breakdown (output tokens, duration, and source — usage vs estimate) revealed on hover.
