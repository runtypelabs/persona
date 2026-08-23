import { createChunkLoader } from "./utils/chunk-loader";
import type { AgentWidgetMessage, AgentWidgetConfig } from "./types";
import type { AgentWidgetSession } from "./session";

/**
 * Loader indirection for the lazy forms-ui chunk (the `[data-tv-form]`
 * placeholder enhancement). Stays in the core bundle. The fallback import must
 * be the literal package subpath: `build:client` runs with `--splitting
 * false`, so a relative import would be inlined; the subpath is marked
 * `--external` and resolves through the package's own `exports` map at
 * consumer runtime (see `history-view-loader.ts` for the full rationale).
 */
export type FormsUiModule = {
  enhanceWithForms: (
    bubble: HTMLElement,
    message: AgentWidgetMessage,
    config: AgentWidgetConfig,
    session: AgentWidgetSession
  ) => void;
};

const { setLoader, load, provide, getSync } = createChunkLoader<FormsUiModule>({
  fallbackImport: () => import("@runtypelabs/persona/forms-ui"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setFormsUiLoader = setLoader;

/** Load the forms UI. Memoized; retries after rejection. */
export const loadFormsUi = load;

/** Eagerly supply the module (tests that assert synchronous form renders). */
export const provideFormsUi = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getFormsUiSync = getSync;
