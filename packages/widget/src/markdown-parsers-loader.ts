import { createChunkLoader } from "./utils/chunk-loader";
import type { Marked } from "marked";
import type DOMPurify from "dompurify";

export type MarkdownParsersModule = {
  Marked: typeof Marked;
  DOMPurify: typeof DOMPurify;
};

// Memoization + rejection-retry semantics live in `createChunkLoader`. The
// ESM/CJS fallback imports `./markdown-parsers-entry` directly; the IIFE/CDN
// build registers a loader that fetches the `markdown-parsers.js` chunk.
const { setLoader, load, provide, getSync } =
  createChunkLoader<MarkdownParsersModule>({
    fallbackImport: () => import("./markdown-parsers-entry"),
  });

// Surfaces that want to self-heal when the lazy `markdown-parsers.js` chunk
// lands. See `onMarkdownParsersReady` below for why this is centralized.
const readySubscribers = new Set<() => void>();

// Fan out to everyone waiting to re-render, exactly once per subscriber.
// Called from BOTH the eager (`provideMarkdownParsers`) and lazy
// (`loadMarkdownParsers`) paths so a subscriber can't miss the transition.
const notifyParsersReady = (): void => {
  // Snapshot + clear first: fire-once semantics, and a callback that re-subscribes
  // (it won't — `onMarkdownParsersReady` no-ops once ready) can't loop.
  const subs = [...readySubscribers];
  readySubscribers.clear();
  for (const cb of subs) {
    // One bad subscriber must not starve the others (or leave messages escaped).
    try {
      cb();
    } catch {
      /* subscriber threw: swallow so the remaining re-renders still run */
    }
  }
};

export const setMarkdownParsersLoader = setLoader;

// On a failed chunk load (404, ad blocker, offline), `createChunkLoader`
// resets its cached promise so a later call retries. Pending subscribers are
// KEPT — a surface that rendered escaped during the failed attempt must still
// heal when a retry (kicked by a new subscriber or an explicit
// loadMarkdownParsers() call) succeeds; dropping them left that surface
// escaped forever after a transient failure. They're only retained while the
// parsers stay unloaded — success releases them (fire-once in
// `notifyParsersReady`), and callers can unsubscribe.
export const loadMarkdownParsers = (): Promise<MarkdownParsersModule> => {
  const cached = getSync();
  if (cached) return Promise.resolve(cached);
  return load().then((mod) => {
    notifyParsersReady();
    return mod;
  });
};

/**
 * Register `cb` to run once the markdown parsers (marked + DOMPurify) become
 * available, i.e. when the lazy `markdown-parsers.js` chunk resolves on the
 * IIFE/CDN build. Returns an unsubscribe function.
 *
 * This exists so every markdown render surface (chat messages, artifact pane,
 * and any future one) shares a SINGLE self-heal path instead of each wiring its
 * own `loadMarkdownParsers().then(reRender)`. Before this, a new surface that
 * forgot to do that rendered escaped plain text until a user interaction forced
 * a re-render — the recurring first-render bug (chat messages, then the artifact
 * pane) this centralizes away.
 *
 * If the parsers are ALREADY loaded, `cb` is not scheduled and a no-op
 * unsubscribe is returned: the caller's first render already used real markdown,
 * so there is nothing to heal (this is the ESM/CJS build's steady state, and the
 * CDN build's state after the first chunk load). Registering also kicks the load
 * so a surface that renders before anything else triggers it still heals.
 * Fires at most once per subscription.
 */
export const onMarkdownParsersReady = (cb: () => void): (() => void) => {
  if (getSync()) return () => {};
  readySubscribers.add(cb);
  // Ensure the chunk is actually being fetched; harmless if already in flight.
  // Swallow rejection here — on failure the subscriber stays registered (see
  // the note on `loadMarkdownParsers`) and the surface keeps its escaped
  // fallback until a retry succeeds; this catch only avoids an unhandled
  // rejection.
  void loadMarkdownParsers().catch(() => {});
  return () => {
    readySubscribers.delete(cb);
  };
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
  provide(mod);
  notifyParsersReady();
};

export const getMarkdownParsersSync = getSync;
