/**
 * Generic memoized loader for a lazy code-split chunk.
 *
 * Backs the near-identical loader indirections in the core/eager bundle
 * (`context-mentions-loader.ts`, `context-mentions-inline-loader.ts`,
 * `markdown-parsers-loader.ts`): each registers a runtime loader (IIFE/CDN
 * sibling-URL chunk) and falls back to an external/relative dynamic import for
 * ESM/CJS consumers. The shared semantics are:
 *
 * - `load()` memoizes the resolved module (`moduleCache`) and the in-flight
 *   promise (`loadPromise`) so concurrent callers share one import.
 * - A rejected load clears `loadPromise` so a later call retries after a
 *   transient failure (one dropped fetch must not disable the feature for the
 *   whole session); the current caller still sees the rejection.
 * - The registered loader wins over `fallbackImport`; if no loader is
 *   registered, `fallbackImport` is used.
 *
 * IMPORTANT: this module must import nothing beyond types. It sits in the core
 * bundle, so any value import here could drag chunk code back into core and
 * defeat the split (see `context-mentions-bundle.test.ts`).
 */

export type ChunkLoaderOptions<T> = {
  /**
   * Dynamic import used when no runtime loader has been registered. Keep the
   * `import(...)` literal in the calling module (not here) so the bundler
   * resolves it as an external subpath / relative chunk at that call site.
   */
  fallbackImport: () => Promise<T>;
  /**
   * When true, registering a new loader clears the cached module and any
   * in-flight promise, so a swapped loader (test injection) takes effect
   * deterministically. Production registers its loader once before any load, so
   * this only matters mid-session.
   */
  resetOnSetLoader?: boolean;
};

export type ChunkLoader<T> = {
  setLoader: (l: () => Promise<T>) => void;
  load: () => Promise<T>;
  /** Register a resolved module synchronously (eager builds that bundle it). */
  provide: (mod: T) => void;
  /** The cached module, or null if not loaded/provided yet. */
  getSync: () => T | null;
};

export const createChunkLoader = <T>(
  options: ChunkLoaderOptions<T>
): ChunkLoader<T> => {
  const { fallbackImport, resetOnSetLoader = false } = options;

  let loader: (() => Promise<T>) | null = null;
  let moduleCache: T | null = null;
  let loadPromise: Promise<T> | null = null;

  const setLoader = (l: () => Promise<T>): void => {
    loader = l;
    if (resetOnSetLoader) {
      moduleCache = null;
      loadPromise = null;
    }
  };

  const load = (): Promise<T> => {
    if (moduleCache) return Promise.resolve(moduleCache);
    if (loadPromise) return loadPromise;
    const importChunk = loader ?? fallbackImport;
    loadPromise = importChunk()
      .then((mod) => {
        moduleCache = mod;
        return mod;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  };

  const provide = (mod: T): void => {
    moduleCache = mod;
  };

  const getSync = (): T | null => moduleCache;

  return { setLoader, load, provide, getSync };
};
