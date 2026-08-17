---
"@runtypelabs/persona": patch
---

The conversation-open stand-in now waits 250ms before taking over the surface, so fast fetches swap straight from the welcome or previous conversation to the loaded transcript with no skeleton flash, the failed-open surface still appears immediately, and the transcript fades in briefly at commit, honoring reduced motion.
