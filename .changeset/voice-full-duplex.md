---
"@runtypelabs/persona": minor
---

Support full-duplex (speech-to-speech) voice calls, such as GPT-Live, in the built-in Runtype voice provider. The provider now declares `voiceCapabilities=full-duplex-v1` on the voice WebSocket. It handles `session_config`, turn-keyed `transcript_update`, `delegation_started`/`delegation_completed`, and `audio_clear` (barge-in) frames. In a speech-to-speech session, reply audio plays continuously, and "speaking" ends when the queued audio has played. A stopped reply is also cancelled on the server.

Voice transcripts that carry a `turnId` are now reconciled by `(turnId, role)`. Each pair keeps one chat bubble that updates in place. Overlapping turns stay separate, and a late user transcript renders above its own turn's reply. No empty assistant placeholder is injected; the typing indicator covers the wait. Transcripts without a `turnId` keep the existing alternating behavior.

The realtime provider now re-registers its playback-drained callback for every reply, so later replies also return the status to "listening".
