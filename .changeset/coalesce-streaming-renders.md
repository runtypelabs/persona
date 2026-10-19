---
"@runtypelabs/persona": patch
---

Fix `connectStream` replay of long tool-heavy transcripts hanging and crashing the tab. While a turn streams, transcript updates now render once per animation frame (user messages, approvals, and pending local tools still apply immediately), unchanged rows stay in place instead of being cloned and re-morphed on every pass, and the session no longer re-sorts the whole transcript on each streamed message. Replay cost is now linear in the number of frames.
