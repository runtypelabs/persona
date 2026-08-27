---
"@runtypelabs/persona": patch
---

Run agent-mode text through the configured `streamParser`. Agent `text_delta` chunks previously appended the raw delta straight onto the message, bypassing `streamParser` and leaving `rawContent` unset — so a server-pinned agent that replies with a JSON envelope rendered the raw `{"text": ...}` in the bubble and never dispatched its action. Agent text now flows through the same structured-content path as flow text. Agents using the default plain-text parser are unaffected.
