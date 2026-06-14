---
"@runtypelabs/persona": minor
---

Add `createPcmStreamPlayer` — a reusable, jitter-buffered AudioWorklet player for raw PCM16 / 24 kHz / mono streams, exported from `@runtypelabs/persona/voice-worklet-player` alongside the new `PcmStreamPlayer` type. It's the same worklet engine that backs the realtime voice provider, now generalized: a configurable `prebufferMs` waterline, graceful underrun handling (a late chunk produces brief silence and a re-buffer rather than a click), `pause()`/`resume()` via the AudioContext, and an `onStarted` callback that fires when audible playback actually begins (so a UI can hold a loading state through the prebuffer instead of flipping to "playing" on the first byte).

This is the recommended way to play streamed audio inside a hosted `SpeechEngine` (the per-message "Read aloud" / auto-speak seam). A server TTS engine that streams PCM — OpenAI, ElevenLabs, Azure, etc. — can feed each chunk to the player and get gapless playback with the right latency↔smoothness trade-off for bursty HTTP-delivered audio, instead of hand-scheduling `AudioBufferSourceNode`s (which clicks under jitter). See `examples/embedded-app/src/server-tts-engine.ts` for a complete streaming engine built on it.

`createWorkletPlaybackEngine` (the realtime voice provider's `createPlaybackEngine` injection) is unchanged — it's now a thin alias of `createPcmStreamPlayer` with the default prebuffer.
