---
"@runtypelabs/persona": patch
---

Normalize browser dictation transcripts, suppress duplicate revisions, and wait for speech pauses before finishing. Measure microphone amplitude when the dictation waveform is requested and release capture resources reliably. Restore the listening fallback if measurement becomes unavailable while transcription continues. Avoid rewriting the composer during audio level updates.

Report zero queued audio after the final playback source ends, including when the browser audio clock lags by a rendering quantum.
