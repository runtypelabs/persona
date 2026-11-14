---
"@runtypelabs/persona": patch
---

Finish browser dictation after microphone silence even when resumed speech does not emit another speech-end event. Silence detection now attempts microphone measurement independently of waveform display, while browsers without usable measurement retain speech-event and transcript-inactivity fallbacks.
