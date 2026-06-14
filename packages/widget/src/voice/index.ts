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

export {
  ReadAloudController,
  type ReadAloudListener
} from './read-aloud-controller';
