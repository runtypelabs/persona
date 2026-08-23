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

// The capture/persistence runtime rides in the same chunk: nothing event-stream
// related is worth core bytes on pages where the toggle (default false) is off.
// ui.ts constructs these at chunk adoption and stages tapped events meanwhile.
export { EventStreamBuffer } from "./utils/event-stream-buffer";
export { EventStreamStore } from "./utils/event-stream-store";
export { ThroughputTracker } from "./utils/throughput-tracker";

import type { createEventStreamView as CreateEventStreamView } from "./components/event-stream-view";

/** Mounted-view handle: what `createEventStreamView` returns. */
export type EventStreamViewHandle = ReturnType<typeof CreateEventStreamView>;
