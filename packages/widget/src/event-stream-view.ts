/**
 * Standalone event-stream-view chunk (`dist/event-stream-view.js`).
 *
 * The IIFE/CDN widget bundle marks `@runtypelabs/persona/event-stream-view`
 * external so the observability panel is excluded from the core payload; this
 * file is built as a self-contained sibling chunk
 * (`tsup.event-stream-view.config.ts`) and loaded on demand by the loader
 * registered in `index-global.ts`. ESM/CJS consumers reach it via this same
 * (external) subpath.
 *
 * Lazy-runtime transport entry only: exports are limited to the mount contract
 * the loader needs.
 */

export { createEventStreamView } from "./event-stream-view-entry";
export type {
  EventStreamViewOptions,
  EventStreamViewHandle,
} from "./event-stream-view-entry";
