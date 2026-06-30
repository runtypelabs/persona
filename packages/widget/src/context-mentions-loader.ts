/**
 * Loader indirection for the lazy context-mentions chunk (core bundle, tiny).
 *
 * Mirrors `markdown-parsers-loader.ts`: the IIFE/CDN entry (`index-global.ts`)
 * registers a loader that imports the standalone `context-mentions.js` chunk
 * from a sibling URL; ESM/CJS consumers fall back to a direct dynamic import.
 * Either way the heavy runtime stays out of the core bundle until first use.
 */

import type {
  ContextMentionMountContext,
  ContextMentionEngine,
} from "./context-mentions-entry";

export type ContextMentionsModule = {
  mountContextMentions: (ctx: ContextMentionMountContext) => ContextMentionEngine;
};

let loader: (() => Promise<ContextMentionsModule>) | null = null;
let moduleCache: ContextMentionsModule | null = null;
let loadPromise: Promise<ContextMentionsModule> | null = null;

export const setContextMentionsLoader = (
  l: () => Promise<ContextMentionsModule>
): void => {
  loader = l;
};

export const loadContextMentions = (): Promise<ContextMentionsModule> => {
  if (moduleCache) return Promise.resolve(moduleCache);
  if (loadPromise) return loadPromise;
  if (!loader) {
    // ESM/CJS consumers: import the entry directly (bundlers resolve it).
    loadPromise = import("./context-mentions-entry").then((mod) => {
      moduleCache = mod;
      return mod;
    });
    return loadPromise;
  }
  loadPromise = loader().then((mod) => {
    moduleCache = mod;
    return mod;
  });
  return loadPromise;
};
