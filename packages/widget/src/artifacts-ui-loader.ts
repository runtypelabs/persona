import { createIconButton, createLabelButton, createSplitButton, createToggleGroup } from "./utils/buttons";
import { createChunkLoader } from "./utils/chunk-loader";
import { componentRegistry } from "./components/registry";
import { getLoadingLabelRuntimeSync, loadLoadingLabelRuntime } from "./loading-label-runtime-loader";
import {
  getMarkdownParsersSync,
  onMarkdownParsersReady,
} from "./markdown-parsers-loader";
import { loadIconsExtra, setIconsExtraLoader } from "./icons-extra-loader";

/**
 * Loader indirection + ADOPTION for the lazy artifacts-ui chunk. Stays in the
 * core bundle. The fallback import must be the literal package subpath (see
 * `history-view-loader.ts` for the `--splitting false` rationale).
 *
 * `loadArtifactsUi` performs one-time adoption on first resolution:
 *  1. injects core's componentRegistry (the chunk's own copy is empty);
 *  2. registers the built-in artifact components into core's registry —
 *     UNLESS the host already registered a component under that name, which
 *     must keep winning like it did against the old eager registration;
 *  3. pipes core's markdown parsers into the chunk's own loader copy (now and
 *     on core's parsers-ready), and points the chunk's icons-extra loader
 *     copy at core's;
 *  4. notifies `onArtifactsUiReady` subscribers (transcript re-render heal).
 */
export type ArtifactsUiModule = typeof import("./artifacts-ui-entry");

/** Component names whose renderers live in the lazy artifacts-ui chunk. */
export const LAZY_ARTIFACT_COMPONENTS = [
  "PersonaArtifactCard",
  "PersonaArtifactInline",
] as const;

const { setLoader, load, provide, getSync } = createChunkLoader<ArtifactsUiModule>({
  fallbackImport: () => import("@runtypelabs/persona/artifacts-ui"),
});

let adopted: ArtifactsUiModule | null = null;
const readySubscribers = new Set<() => void>();

const adopt = (mod: ArtifactsUiModule): ArtifactsUiModule => {
  if (adopted) return adopted;
  adopted = mod;

  mod.initArtifactsUi({ componentRegistry, loadingLabels: getLoadingLabelRuntimeSync()!, buttons: { createIconButton, createLabelButton, createSplitButton, createToggleGroup } });

  // Host-registered components (config.components / registerAll at widget
  // init) must keep overriding the built-ins, exactly as they did against the
  // old import-time registration.
  for (const name of LAZY_ARTIFACT_COMPONENTS) {
    if (!componentRegistry.has(name)) {
      componentRegistry.register(
        name,
        name === "PersonaArtifactCard"
          ? mod.PersonaArtifactCard
          : mod.PersonaArtifactInline,
        { bubbleChrome: false }
      );
    }
  }

  // Sync the chunk's own markdown-parsers copy with core's, now and later.
  const parsers = getMarkdownParsersSync();
  if (parsers) {
    mod.__provideMarkdownParsers(parsers);
  } else {
    onMarkdownParsersReady(() => {
      const late = getMarkdownParsersSync();
      if (late) mod.__provideMarkdownParsers(late);
    });
  }
  // Point the chunk's icons-extra copy at core's loader (its own fallback is
  // a bare subpath import no browser can resolve).
  // Source/eager consumers can share this very loader with the artifact entry.
  // Wiring it back to itself would recurse before an import can be cached.
  if (mod.__setIconsExtraLoader !== setIconsExtraLoader) {
    mod.__setIconsExtraLoader(loadIconsExtra);
  }

  const subs = [...readySubscribers];
  readySubscribers.clear();
  for (const cb of subs) {
    try {
      cb();
    } catch {
      /* one bad subscriber must not starve the others */
    }
  }
  return mod;
};

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setArtifactsUiLoader = setLoader;

/** Load AND adopt the artifacts UI. Memoized; retries after rejection. */
export const loadArtifactsUi = (): Promise<ArtifactsUiModule> =>
  Promise.all([load(), loadLoadingLabelRuntime()]).then(([mod]) => adopt(mod));

/** Eagerly supply + adopt the module (tests that assert synchronous panes). */
export const provideArtifactsUi = (mod: ArtifactsUiModule): void => {
  provide(mod);
  if (getLoadingLabelRuntimeSync()) adopt(mod);
};

/** Synchronous access once adopted; null before that. */
export const getArtifactsUiSync = (): ArtifactsUiModule | null => {
  if (adopted) return adopted;
  if (!getLoadingLabelRuntimeSync()) return null;
  const sync = getSync();
  return sync ? adopt(sync) : null;
};

/**
 * Register `cb` to run once the chunk is adopted. Passive — never kicks the
 * fetch (renders and the sidebar gate do). No-op once adopted.
 */
export const onArtifactsUiReady = (cb: () => void): (() => void) => {
  if (adopted) return () => {};
  readySubscribers.add(cb);
  return () => {
    readySubscribers.delete(cb);
  };
};
