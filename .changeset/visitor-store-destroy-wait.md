---
"@runtypelabs/persona": patch
---

A client-token first init that is still queued behind another tab's visitor lock when its widget is destroyed (teardown or client-token swap) now rejects instead of running after teardown, so it can no longer mint and store a visitor that races the replacement widget's own init.
