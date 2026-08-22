/**
 * Event-stream-view runtime entry — the module that assembles the lazily
 * loaded event-stream observability panel. It is NEVER statically imported on
 * the core path: the IIFE/CDN build marks
 * `@runtypelabs/persona/event-stream-view` external (`tsup.global.config.ts`)
 * and loads the standalone `event-stream-view.js` chunk from a sibling URL on
 * first open of the panel. The core reaches it through
 * `event-stream-view-loader.ts`.
 *
 * Mirrors `history-view-entry.ts`.
 */

export { createEventStreamView } from "./components/event-stream-view";
export type { EventStreamViewOptions } from "./components/event-stream-view";

import type { createEventStreamView as CreateEventStreamView } from "./components/event-stream-view";

/** Mounted-view handle: what `createEventStreamView` returns. */
export type EventStreamViewHandle = ReturnType<typeof CreateEventStreamView>;
