---
"@runtypelabs/persona": patch
---

fix(event-stream): fall back to buffer when Copy All gets empty from store

When "All events" is selected and Copy All is clicked, the code used getFullHistory() which reads from IndexedDB. If the store's DB isn't ready (e.g. open failed, private browsing), getAll() returns []. Now fall back to buffer.getAll() when the store returns empty so users get the visible in-memory events instead of [].
