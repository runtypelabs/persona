---
"@runtypelabs/persona": minor
---

Warm the voice path on mic intent so calls start faster. New `voiceRecognition.prewarm` option (`'hover'`, `false`, or a custom `({ warm, micButton, mount }) => cleanup` hook), on by default (`'hover'`) in client token mode. The `runtype` provider sends a throttled, fire-and-forget `POST /v1/client/agents/{agentId}/voice/prewarm`; the browser (Web Speech) path warms the client-token session. Custom providers can opt in with an optional `VoiceProvider.prewarm()`. New opt-in `voiceRecognition.provider.runtype.prewarmMode: 'attach'` (with `attachIdleMs`) opens the voice WebSocket early and starts the call on it at the click.
