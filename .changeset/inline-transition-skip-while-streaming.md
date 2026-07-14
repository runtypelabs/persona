---
"@runtypelabs/persona": patch
---

Skip the inline artifact streaming-to-complete View Transition while the session is still streaming. The transition captures the whole document, so cross-fading it over a transcript whose text is still moving produced a ghosting / motion-blur effect on chat messages. The body swap still happens, just instantly; the animated transition still runs when the swap lands after the stream has ended.
