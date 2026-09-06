---
"@runtypelabs/persona": patch
---

Route custom voice providers through the widget microphone controls, status display, and call lifecycle. Custom realtime providers can now honor None, Cancel, and Barge-in modes without falling back to browser dictation.

Disconnect replaced or disabled providers, ignore callbacks from retired providers, and discard cancelled replies. Custom providers with overlapping turns can supply optional transcript turn IDs to prevent a late cancelled reply from replacing the next answer.

Refresh generated event types for additive fields and context notices already present in the public Runtype API.
