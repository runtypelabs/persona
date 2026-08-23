/**
 * Subpath/chunk module for the lazy voice runtime
 * (`@runtypelabs/persona/voice-runtime` → `dist/voice-runtime.{js,cjs}`):
 * the provider factory plus the Runtype (WebSocket STT + audio playback) and
 * browser (SpeechRecognition) providers.
 *
 * Transport-entry only. `session.ts` loads this on demand via
 * `voice-runtime-loader.ts` when a voice provider is configured — the IIFE
 * from a sibling URL, ESM/CJS via this external subpath. (The read-aloud
 * path — ReadAloudController + BrowserSpeechEngine — stays in core: it is
 * small and speech synthesis is user-gesture-adjacent.)
 */
export {
  createVoiceProvider,
  createBestAvailableVoiceProvider,
  isVoiceSupported,
} from "./voice/voice-factory";
export { RuntypeVoiceProvider } from "./voice/runtype-voice-provider";
export { BrowserVoiceProvider } from "./voice/browser-voice-provider";
