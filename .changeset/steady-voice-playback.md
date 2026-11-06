---
"@runtypelabs/persona": patch
---

Buffer 150 ms of realtime voice audio before playback and refill after underruns instead of playing isolated late chunks. Preserve interruption clearing and release short continuous replies without waiting for an end-of-audio signal.
