---
"@runtypelabs/persona": patch
---

Full-duplex (GPT-Live) calls no longer show a delegated answer twice. The Runtype voice provider now declares the `delegation_read_back` capability. When the server confirms it, the provider hides exactly the spoken read-back the server tags with an answered delegation's `delegationId`, instead of guessing "the first new assistant utterance after `delegation_completed`". That guess hid a filler that was still finishing, and showed the real read-back as a second reply. A read-back is hidden only from its first frame, so a caption is never left half-shown. Servers that don't confirm the capability keep the previous behavior.

`VoiceDelegationResult` gains an optional `inChat` (default `true`). Set it to `false` for an answer no chat message carries, so its spoken read-back stays visible as a caption. A spoken "cancel that" for a pending voice approval now does this, so its acknowledgement no longer vanishes from the chat.
