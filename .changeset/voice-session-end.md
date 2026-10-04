---
"@runtypelabs/persona": minor
---

The Runtype voice provider now handles the server's `session_end { reason, message?, retryable? }` frame (voice protocol Amendment 6) and says why a call ended in the composer status line:

- **Status text:** "Voice call ended after a quiet period." (`idle_timeout`), "This voice call reached its time limit." (`max_duration`), "The voice session ended." (`provider_ended`), "Voice session expired. Tap the mic to reconnect." (`auth_expired`), or the server's message for `quota` (default "Voice is unavailable right now."). An unknown reason is treated as an ordinary server end and shows nothing.
- **Reconnect:** after `provider_error` or `server_restart`, the call reconnects once after 1–2 seconds ("Voice connection lost. Reconnecting…" / "Reconnecting…"). A second failure shows "Voice connection lost." It never reconnects after the visitor hangs up, and never twice. If the browser keeps audio suspended outside a click (iOS), the reconnect stops with "Voice connection lost. Tap the mic to reconnect."
- **Attach idle:** the close (code 4408) is now a quiet end instead of an error.
- **No `session_end`:** an abnormal close without the frame behaves as before.

`VoiceProvider` gains optional `takeNotice()`, and the session gains `getVoiceNotice()`.
