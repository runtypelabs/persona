---
"@runtypelabs/persona": minor
---

Add a built-in Runtype hosted TTS provider for read-aloud. `textToSpeech: { provider: 'runtype' }` now powers the per-message "Read aloud" button (and auto-speak) with a new built-in `RuntypeSpeechEngine` that streams PCM from Runtype's `POST {host}/v1/agents/:agentId/speak` endpoint. `host`/`agentId`/`clientToken` are derived from the widget config (new `textToSpeech.agentId`/`host`/`prebufferMs` options, falling back to `apiUrl`/`voiceRecognition.provider.runtype.agentId`/`clientToken`).

Playback defaults to a main-thread `AudioPlaybackManager` (in-bundle, with prebuffer, pause/resume, graceful-underrun softening and a real "audible start" signal). For the higher-quality jitter-buffered AudioWorklet player, pass the new `textToSpeech.createPlaybackEngine` and import `createPcmStreamPlayer` from `@runtypelabs/persona/voice-worklet-player` — it then ships in your bundle, not Persona's.

Unless `browserFallback: false`, the engine is wrapped in a `FallbackSpeechEngine` so a missing endpoint or transient failure transparently falls back to the browser voice — never a broken button — and auto-upgrades to Runtype voices once the endpoint answers.

Bundle impact: `provider: 'runtype'` is opt-in, so the whole read-aloud engine (`RuntypeSpeechEngine` + `FallbackSpeechEngine` + its `AudioPlaybackManager`) is code-split out of the CDN payload (`index.global.js`) into a lazy `runtype-tts.js` chunk (~2 kB), loaded on demand and prefetched at init so first-audio latency is unchanged. npm/bundler consumers get it inlined (and tree-shaken when unused). `RuntypeSpeechEngine`, `FallbackSpeechEngine`, and their option types are exported from `@runtypelabs/persona/voice-worklet-player`.
