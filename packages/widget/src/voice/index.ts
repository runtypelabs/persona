// Voice Module Exports
// Central export point for all voice-related components

export {
  RuntypeVoiceProvider
} from './runtype-voice-provider';

export {
  BrowserVoiceProvider
} from './browser-voice-provider';

export {
  createVoiceProvider,
  createBestAvailableVoiceProvider,
  isVoiceSupported
} from './voice-factory';

export {
  BrowserSpeechEngine,
  pickBestVoice,
  type BrowserSpeechEngineOptions
} from './browser-speech-engine';

// NOTE: RuntypeSpeechEngine is intentionally NOT re-exported here. It pairs with
// the AudioWorklet player (`worklet-playback-engine`) and ships from the
// `@runtypelabs/persona/voice-worklet-player` subpath; `session.ts` lazy-imports
// it so its module only evaluates when `provider: 'runtype'` actually plays audio.
// FallbackSpeechEngine's value export lives on the
// `@runtypelabs/persona/voice-worklet-player` subpath so the hosted read-aloud
// path can be deferred to the `runtype-tts.js` chunk; only the (erased) type is
// re-exported here for `session.ts`.
export type { FallbackSpeechEngineOptions } from './fallback-speech-engine';

export {
  ReadAloudController,
  type ReadAloudListener
} from './read-aloud-controller';
