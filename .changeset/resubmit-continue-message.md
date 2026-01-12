---
"@runtypelabs/persona": patch
---

Fix resubmit to use [continue] message instead of empty string

Empty string messages were being filtered out by the session, preventing
automatic continuation. Now sends "[continue]" as a special marker that
signals the model should analyze previously injected results.

Also increased resubmit delay from 150ms to 500ms to ensure async
operations complete before triggering continuation.
