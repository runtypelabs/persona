---
"@runtypelabs/persona": minor
---

Add voice interruption and cancellation support to RuntypeVoiceProvider

- Handle `session_config` WebSocket message to receive server-side interruption mode (`none`, `cancel`, `barge-in`)
- New `cancelCurrentPlayback()` method stops audio playback and sends cancel request to server
- When interruption is enabled, `startListening()` cancels in-flight responses instead of throwing
- Track current audio element and request IDs for reliable cancellation and cleanup
- Handle `cancelled` WebSocket message for server-acknowledged cancellation
- Clean up audio resources on disconnect
- Demo: conditionally show browser voice controls based on active TTS provider
