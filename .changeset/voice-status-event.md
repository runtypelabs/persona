---
"@runtypelabs/persona": minor
---

Add a `voice:status` controller event exposing the granular `VoiceStatus` (`listening` / `processing` / `speaking` / `idle` / …) on every transition. Subscribe via `widget.on('voice:status', (e) => e.status)`. Complements the existing coarse `voice:state` (active on/off) event — non-breaking. The new `AgentWidgetVoiceStatusEvent` payload type is exported.

Also fix the message render cache: `computeMessageFingerprint` now includes `voiceProcessing`, so a voice message whose `voiceProcessing` flag flips `true→false` on transcript finalize (typically with unchanged text) re-renders instead of being served the cached in-progress bubble. This previously caused custom voice-processing UIs (via `postprocessMessage` or a `renderMessage` plugin) to stick on finalized messages.
