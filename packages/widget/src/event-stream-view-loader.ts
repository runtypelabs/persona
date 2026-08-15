/**
 * Loader indirection for the lazy event-stream-view chunk (core bundle, tiny).
 *
 * Mirrors `history-view-loader.ts`: the IIFE/CDN entry (`index-global.ts`)
 * registers a loader that imports the standalone `event-stream-view.js` chunk
 * from a sibling URL. ESM/CJS consumers fall back to importing the package's
 * `./event-stream-view` subpath — which `build:client` marks external, so the
 * view is NOT inlined into `dist/index.{js,cjs}` and stays out of the core
 * bundle until the event-stream panel is first opened.
 */

import { createChunkLoader } from "./utils/chunk-loader";
import type {
  EventStreamViewOptions,
  EventStreamViewHandle,
} from "./event-stream-view-entry";

export type EventStreamViewModule = {
  createEventStreamView: (options: EventStreamViewOptions) => EventStreamViewHandle;
};

// IIFE/CDN: sibling-URL chunk via the registered loader.
// ESM/CJS fallback: the package's own `./event-stream-view` subpath (external,
// so the runtime chunk is code-split out of dist/index.{js,cjs} rather than
// inlined). Memoization + rejection-retry semantics live in `createChunkLoader`.
const { setLoader, load } = createChunkLoader<EventStreamViewModule>({
  fallbackImport: () => import("@runtypelabs/persona/event-stream-view"),
});

export const setEventStreamViewLoader = setLoader;
export const loadEventStreamView = load;
