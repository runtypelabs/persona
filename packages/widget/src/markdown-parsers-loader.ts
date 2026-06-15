import type { Marked } from "marked";
import type DOMPurify from "dompurify";

export type MarkdownParsersModule = {
  Marked: typeof Marked;
  DOMPurify: typeof DOMPurify;
};

let loader: (() => Promise<MarkdownParsersModule>) | null = null;
let moduleCache: MarkdownParsersModule | null = null;
let loadPromise: Promise<MarkdownParsersModule> | null = null;

export const setMarkdownParsersLoader = (l: () => Promise<MarkdownParsersModule>) => {
  loader = l;
};

/**
 * Register the parsers synchronously. Used by the ESM/CJS build (where `marked`
 * and `dompurify` are bundled directly via `markdown-parsers-eager.ts`), so
 * `getMarkdownParsersSync()` returns them on the very first render and the
 * synchronous `markdownPostprocessor` / `createDefaultSanitizer` API keeps
 * working without an async round-trip. The IIFE/CDN build never calls this;
 * it lazy-loads the `markdown-parsers.js` chunk instead.
 */
export const provideMarkdownParsers = (mod: MarkdownParsersModule): void => {
  moduleCache = mod;
};

export const loadMarkdownParsers = (): Promise<MarkdownParsersModule> => {
  if (moduleCache) return Promise.resolve(moduleCache);
  if (loadPromise) return loadPromise;
  if (!loader) {
    // Fallback for regular ESM/CJS consumers (they import directly)
    loadPromise = import("./markdown-parsers-entry").then((mod) => {
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

export const getMarkdownParsersSync = (): MarkdownParsersModule | null => {
  return moduleCache;
};
