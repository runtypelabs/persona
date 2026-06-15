// Deferred loader for the hosted Runtype TTS read-aloud engine.
//
// The engine (`RuntypeSpeechEngine` + the `AudioPlaybackManager` it bundles) is
// ~4–5 kB and only used when `textToSpeech.provider: 'runtype'` is configured —
// an opt-in. To keep it out of the CDN payload (`index.global.js`), the IIFE
// build marks the default `import("./runtype-speech-engine")` below external and
// `index-global.ts` registers a loader that imports the standalone
// `runtype-tts.js` chunk from a sibling URL instead. Mirrors how the WebMCP
// polyfill is deferred (see `setWebMcpPolyfillLoader` in `webmcp-bridge.ts`).
//
// In every other build (ESM/CJS main entry, theme-editor) no loader is
// registered, so the default relative import resolves and the engine is inlined
// — those bundlers code-split or have headroom, so there's no runtime fetch for
// npm consumers.

import type { RuntypeSpeechEngine } from "./runtype-speech-engine";
import type { FallbackSpeechEngine } from "./fallback-speech-engine";

/** The slice of the engine chunk the session consumes. */
export type RuntypeTtsModule = {
  RuntypeSpeechEngine: typeof RuntypeSpeechEngine;
  FallbackSpeechEngine: typeof FallbackSpeechEngine;
};

let loader: (() => Promise<RuntypeTtsModule>) | null = null;

/**
 * Override how the Runtype TTS engine module is obtained. By default the session
 * does `import("./runtype-tts-entry")`, which bundlers resolve/inline. The
 * IIFE/CDN entry registers a loader that imports the self-contained
 * `runtype-tts.js` chunk from a URL derived from the widget script's own `src`.
 * Pass `null` to restore the default (used by tests).
 */
export const setRuntypeTtsLoader = (
  l: (() => Promise<RuntypeTtsModule>) | null,
): void => {
  loader = l;
};

/** Resolve the Runtype TTS engine module (registered loader, else inlined import). */
export const loadRuntypeTts = (): Promise<RuntypeTtsModule> =>
  loader ? loader() : import("./runtype-tts-entry");
