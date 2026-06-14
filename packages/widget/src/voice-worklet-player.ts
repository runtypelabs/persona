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
