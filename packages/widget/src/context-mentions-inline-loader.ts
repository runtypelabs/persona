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

import type {
  InlineComposerMountContext,
  InlineComposerHandle,
} from "./context-mentions-inline-entry";

export type ContextMentionsInlineModule = {
  mountInlineComposer: (ctx: InlineComposerMountContext) => InlineComposerHandle;
};

let loader: (() => Promise<ContextMentionsInlineModule>) | null = null;
let moduleCache: ContextMentionsInlineModule | null = null;
let loadPromise: Promise<ContextMentionsInlineModule> | null = null;

export const setContextMentionsInlineLoader = (
  l: () => Promise<ContextMentionsInlineModule>
): void => {
  loader = l;
  // A new loader source invalidates whatever the previous loader produced.
  // Production registers its loader once, before any load, so this only matters
  // when a loader is swapped mid-session (test injection).
  moduleCache = null;
  loadPromise = null;
};

export const loadContextMentionsInline =
  (): Promise<ContextMentionsInlineModule> => {
    if (moduleCache) return Promise.resolve(moduleCache);
    if (loadPromise) return loadPromise;
    const importChunk =
      loader ?? (() => import("@runtypelabs/persona/context-mentions-inline"));
    loadPromise = importChunk()
      .then((mod) => {
        moduleCache = mod;
        return mod;
      })
      .catch((err) => {
        // Clear the cached promise so a later call retries after a transient
        // failure — otherwise one dropped fetch disables inline mode for the
        // whole session. The current caller still sees the rejection.
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  };
