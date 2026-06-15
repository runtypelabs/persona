---
"@runtypelabs/persona": minor
---

Rewrite the `runtype` voice provider to the streaming realtime protocol so it actually speaks. It now connects to `/ws/agents/:agentId/voice` with subprotocol auth (`['runtype.bearer', token]`, never a query-string token), streams continuous PCM16 mic audio, and plays back streamed audio replies, replacing the dead legacy turn-based path.

- **Live transcripts (Option B):** new optional `VoiceProvider.onTranscript(role, text, isFinal)` drives the chat thread from streaming transcript frames: interim user text grows live, the user message finalizes immediately, and the assistant reply lands in sync with its audio.
- **Pluggable playback:** the default `AudioPlaybackManager` is used unless you inject a custom engine via `voiceRecognition.provider.runtype.createPlaybackEngine`. A jitter-buffered AudioWorklet engine ships from the optional subpath `@runtypelabs/persona/voice-worklet-player`.
- **Latency metrics:** new optional `VoiceProvider.onMetrics` plus a `voiceRecognition.onMetrics` config hook surface per-turn latency.
- **Bring-your-own provider:** `voiceRecognition.provider` now accepts `type: 'custom'` with a `custom` field: either a `VoiceProvider` instance or a `() => VoiceProvider` factory. STT-style custom providers deliver a final transcript via `onResult` (sent as a user message); the composer mic now renders for custom providers regardless of Web Speech support. See the `custom-voice-provider` example for a Web Speech adapter.
- **Simpler config:** `runtype.clientToken` and `host` are now optional, defaulting from the widget's `clientToken`/`apiUrl`: the minimum voice config collapses to just `{ agentId }`. `pauseDuration`/`silenceThreshold` are deprecated no-ops on the realtime path (the server's STT owns turn-taking).
