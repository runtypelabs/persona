/**
 * Optional voice playback engine entry (`@runtypelabs/persona/voice-worklet-player`).
 *
 * A jitter-buffered AudioWorklet playback engine for the realtime `runtype`
 * voice provider. Kept out of the main bundle; import and pass it to
 * `voiceRecognition.provider.runtype.createPlaybackEngine` to opt in.
 */
export { createWorkletPlaybackEngine } from "./voice/worklet-playback-engine";
export type { VoicePlaybackEngine } from "./types";
