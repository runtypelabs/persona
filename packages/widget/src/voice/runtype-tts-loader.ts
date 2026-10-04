// Deferred loader for the hosted Runtype TTS read-aloud engine.
//
// The engine (`RuntypeSpeechEngine` + the `AudioPlaybackManager` it bundles) is
// ~4–5 kB and only used when `textToSpeech.provider: 'runtype'` is configured —
// an opt-in. To keep it out of the CDN payload (`index.global.js`), the IIFE
// build marks the default `import("@runtypelabs/persona/runtype-tts")` below
// external and
// `index-global.ts` registers a loader that imports the standalone
// `runtype-tts.js` chunk from a sibling URL instead. Mirrors how the WebMCP
// polyfill is deferred (see `setWebMcpPolyfillLoader` in `webmcp-bridge.ts`).
//
// The ESM/CJS main entry registers no loader: the default import is the
// package's own `./runtype-tts` subpath, which `build:client` marks external,
// so consumer bundlers code-split the engine out of `dist/index.{js,cjs}`.

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
 * does `import("@runtypelabs/persona/runtype-tts")`, which bundlers code-split. The
 * IIFE/CDN entry registers a loader that imports the self-contained
 * `runtype-tts.js` chunk from a URL derived from the widget script's own `src`.
 * Pass `null` to restore the default (used by tests).
 */
export const setRuntypeTtsLoader = (
  l: (() => Promise<RuntypeTtsModule>) | null,
): void => {
  loader = l;
};

/** Resolve the Runtype TTS engine module (registered loader, else the package subpath). */
export const loadRuntypeTts = (): Promise<RuntypeTtsModule> =>
  loader ? loader() : import("@runtypelabs/persona/runtype-tts");
