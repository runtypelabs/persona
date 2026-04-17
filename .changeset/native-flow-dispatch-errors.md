---
'@runtypelabs/persona': minor
'@runtypelabs/persona-proxy': minor
---

Handle `step_error`, `dispatch_error`, and `flow_error` SSE frames natively: emit `error` events, finalize streaming assistant messages, and transition status to `idle`. Hosts no longer need a custom `parseSSEEvent` callback for these Runtype flow/dispatch error types.
