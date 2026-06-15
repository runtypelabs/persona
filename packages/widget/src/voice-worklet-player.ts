/**
 * Optional PCM playback engine entry (`@runtypelabs/persona/voice-worklet-player`).
 *
 * A jitter-buffered AudioWorklet player for raw PCM16 / 24 kHz / mono streams,
 * kept out of the main bundle. Two ways in:
 *   - `createPcmStreamPlayer({ prebufferMs })` — general primitive with
 *     pause/resume; reuse it inside a hosted `SpeechEngine` (server/ElevenLabs/
 *     OpenAI TTS) for gapless "Read aloud".
 *   - `createWorkletPlaybackEngine` — realtime-named alias; pass it to
 *     `voiceRecognition.provider.runtype.createPlaybackEngine`.
 */
export {
  createPcmStreamPlayer,
  createWorkletPlaybackEngine,
} from "./voice/worklet-playback-engine";
export type { PcmStreamPlayerOptions } from "./voice/worklet-playback-engine";
export type { VoicePlaybackEngine, PcmStreamPlayer } from "./types";

// Runtype-hosted "Read aloud" engine. It streams PCM from Runtype's
// `/v1/agents/:id/speak` into a PcmStreamPlayer. By default that's the in-bundle
// AudioPlaybackManager, so the engine no longer depends on the worklet — but it
// pairs naturally with `createPcmStreamPlayer` above (pass it via
// `createPlaybackEngine`) for jitter-buffered playback. Most integrations don't
// import it directly — `textToSpeech: { provider: 'runtype' }` wires it
// automatically; this export is for manual `textToSpeech.createEngine` control.
export {
  RuntypeSpeechEngine,
  type RuntypeSpeechEngineOptions,
} from "./voice/runtype-speech-engine";

// Browser-fallback wrapper for a hosted SpeechEngine: tries the primary, and on
// a pre-playback failure silently switches to a secondary (browser) voice.
// `textToSpeech: { provider: 'runtype' }` wires it automatically; exported here
// for manual `textToSpeech.createEngine` control. Kept off the main entry so the
// IIFE/CDN build can defer the whole read-aloud path to `runtype-tts.js`.
export {
  FallbackSpeechEngine,
  type FallbackSpeechEngineOptions,
} from "./voice/fallback-speech-engine";
