---
"@runtypelabs/persona": minor
---

Add voice provider system with speech-to-text and text-to-speech support

- New `voice/` module with `RuntypeVoiceProvider` (server-side STT via WebSocket) and `BrowserVoiceProvider` (Web Speech API fallback)
- Factory functions `createVoiceProvider`, `createBestAvailableVoiceProvider`, and `isVoiceSupported` for provider selection
- Session-level voice lifecycle management: `setupVoice()`, `toggleVoice()`, `isVoiceActive()`, `getVoiceStatus()`
- `TextToSpeechConfig` type for browser and Runtype TTS with configurable voice, rate, and pitch
- `onVoiceStatusChanged` callback for UI integration with Runtype provider status updates
- New exports: `VoiceProvider`, `VoiceResult`, `VoiceStatus`, `VoiceConfig` types and voice factory functions
