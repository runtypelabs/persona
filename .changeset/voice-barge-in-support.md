---
"@runtypelabs/persona": minor
---

Add barge-in voice interruption mode with always-on mic and speech detection

- New `VoiceActivityDetector` class provides reusable RMS-based VAD with two modes: `silence` (user stopped talking) and `speech` (user started talking)
- In barge-in mode the mic stays hot between turns — audio pipeline is reused instead of torn down after each utterance
- During agent playback, VAD monitors for sustained speech and automatically interrupts playback to begin recording
- Mic button shows recording state during agent speech in barge-in mode and acts as a "hang up" to end the session
- New `isBargeInActive()` and `deactivateBargeIn()` methods on `VoiceProvider` and `Session` for UI coordination
- Guard against late `audio_end` and audio chunks from cancelled requests
