---
"@runtypelabs/persona": minor
---

Add stop-streaming support: the composer submit button now doubles as a stop button while a response is streaming. Clicking it (or pressing Enter) aborts the in-flight stream via `Session.cancel()` and leaves the textarea contents intact so the user can edit and resend. `Session.cancel()` now also stops in-progress audio playback (Web Speech API and the Runtype voice provider) so "stop" really means "stop", matching ChatGPT / ElevenLabs / Gemini voice UX. Configurable via new `sendButton.stopIconName` (default `"square"`), `sendButton.stopTooltipText` (default `"Stop generating"`), and `copy.stopButtonLabel` (default `"Stop"`) options.
