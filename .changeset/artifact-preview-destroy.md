---
"@runtypelabs/persona": patch
---

Add a destroy() hook to the artifact preview handle that releases the file-preview loading overlay's pending timers and window message listener. The artifact pane destroys its preview on widget teardown and deselection, and an inline block's collapse to a card destroys the discarded body, so dropped previews no longer leak timers or listeners.
