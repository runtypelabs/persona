/**
 * Loader indirection for the lazy context-mentions chunk (core bundle, tiny).
 *
 * Mirrors `markdown-parsers-loader.ts`: the IIFE/CDN entry (`index-global.ts`)
 * registers a loader that imports the standalone `context-mentions.js` chunk
 * from a sibling URL. ESM/CJS consumers fall back to importing the package's
 * `./context-mentions` subpath — which `build:client` marks external, so the
 * runtime is NOT inlined into `dist/index.{js,cjs}` and stays out of the core
 * bundle until first use. (A relative `./context-mentions-entry` import would be
 * inlined by the no-splitting build, defeating the whole point.)
 */

import { createChunkLoader } from "./utils/chunk-loader";
import type {
  ContextMentionMountContext,
  ContextMentionEngine,
} from "./context-mentions-entry";

export type ContextMentionsModule = {
  mountContextMentions: (ctx: ContextMentionMountContext) => ContextMentionEngine;
};

// IIFE/CDN: sibling-URL chunk via the registered loader.
// ESM/CJS fallback: the package's own `./context-mentions` subpath (external, so
// the runtime chunk is code-split out of dist/index.{js,cjs} rather than
// inlined). Memoization + rejection-retry semantics live in `createChunkLoader`.
const { setLoader, load } = createChunkLoader<ContextMentionsModule>({
  fallbackImport: () => import("@runtypelabs/persona/context-mentions"),
});

export const setContextMentionsLoader = setLoader;
export const loadContextMentions = load;
