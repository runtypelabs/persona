---
"@runtypelabs/persona": patch
---

Full-duplex (GPT-Live) calls no longer show a delegated answer twice. The Runtype voice provider now declares the `delegation_read_back` capability. When the server confirms it, the provider hides exactly the spoken read-back the server tags with an answered delegation's `delegationId`, instead of guessing "the first new assistant utterance after `delegation_completed`". That guess hid a filler that was still finishing, and showed the real read-back as a second reply. Servers that don't confirm the capability keep the previous behavior.
