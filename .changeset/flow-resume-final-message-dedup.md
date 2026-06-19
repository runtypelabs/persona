---
"@runtypelabs/persona": patch
---

Fix duplicated final assistant message on flow continuation streams. A tool-driven `/resume` continues a flow on a fresh stream that does not re-emit `execution_start`, so the stream defaulted to agent mode and mis-routed the final prompt-step finalization — rendering the streamed text once and then a second time from `step_complete.result.response`. The client now recovers the flow execution kind from the leading `step_*` frame when `execution_start` is absent, so the finalization reconciles in place. Agent streams are unaffected (they carry no `stepType`).
