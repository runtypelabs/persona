// Standalone entry for the deferred Runtype TTS chunk (`dist/runtype-tts.js`).
//
// Bundles the hosted read-aloud engine, its browser-fallback wrapper, and the
// `AudioPlaybackManager` they depend on, so the IIFE/CDN build can load the
// whole `provider: 'runtype'` read-aloud path on demand (kept out of
// `index.global.js`). `session.ts` resolves this module via
// `runtype-tts-loader.ts`; the loader is overridden in `index-global.ts` to
// fetch this chunk from a sibling URL. See `runtype-tts-loader.ts`.
export { RuntypeSpeechEngine } from "./runtype-speech-engine";
export { FallbackSpeechEngine } from "./fallback-speech-engine";
