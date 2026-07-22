/**
 * Loader indirection for the lazy inline-mention chunk (core bundle, tiny).
 *
 * Sibling of `context-mentions-loader.ts`. The IIFE/CDN entry (`index-global.ts`)
 * registers a loader that imports the standalone `context-mentions-inline.js`
 * chunk from a sibling URL; ESM/CJS consumers fall back to the package's
 * `./context-mentions-inline` subpath — which `build:client` marks external, so
 * the contenteditable engine is NOT inlined into `dist/index.{js,cjs}` and stays
 * out of the core bundle. (A relative `./context-mentions-inline-entry` import
 * would be inlined by the no-splitting build, defeating the split.)
 *
 * This is loaded on composer mount when `contextMentions.display === "inline"`,
 * distinct from the chip menu chunk which loads on the first `@`/click.
 */

import { createChunkLoader } from "./utils/chunk-loader";
import type {
  InlineComposerMountContext,
  InlineComposerHandle,
} from "./context-mentions-inline-entry";

export type ContextMentionsInlineModule = {
  mountInlineComposer: (ctx: InlineComposerMountContext) => InlineComposerHandle;
};

// Memoization + rejection-retry semantics live in `createChunkLoader`.
// `resetOnSetLoader` mirrors this loader's original behavior: registering a new
// loader source invalidates whatever the previous loader produced (so a
// mid-session swap for test injection takes effect deterministically).
const { setLoader, load } = createChunkLoader<ContextMentionsInlineModule>({
  fallbackImport: () => import("@runtypelabs/persona/context-mentions-inline"),
  resetOnSetLoader: true,
});

export const setContextMentionsInlineLoader = setLoader;
export const loadContextMentionsInline = load;
