---
"@runtypelabs/persona": patch
---

Flush the latest durable event cursor with the persisted transcript when a page exits so reconnect does not replay text that the widget already rendered.
