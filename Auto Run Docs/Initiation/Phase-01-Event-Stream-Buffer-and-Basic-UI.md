# Phase 01: Event Stream Buffer and Basic UI

This phase delivers a working SSE Event Stream Inspector that captures events and displays them in the chat widget. By the end, you'll be able to enable `features.showEventStreamToggle: true`, see a toggle icon in the header, click it to swap the chat message area for a live-scrolling list of raw SSE events (type badge, timestamp, JSON payload), and click again to return to chat. The event buffer captures from widget init when the feature is enabled, so past events are visible even if the panel is opened later. This is the core vertical slice that proves the feature works end-to-end.

## Tasks

- [x] Add the `showEventStreamToggle` feature flag and event stream types to the type system:
  - In `packages/widget/src/types.ts`, add `showEventStreamToggle?: boolean` to the `AgentWidgetFeatureFlags` type (alongside `showReasoning` and `showToolCalls`)
  - In `packages/widget/src/types.ts`, add a new type `SSEEventRecord` with fields:
    - `id: string` (unique ID, e.g. `evt-${timestamp}-${counter}`)
    - `type: string` (the SSE event type, e.g. "step_chunk", "agent_turn_delta", "flow_complete")
    - `timestamp: number` (Date.now() when captured)
    - `payload: string` (raw JSON string of the event payload)
  - Export `SSEEventRecord` from `packages/widget/src/index.ts`

- [x] Create the ring buffer module at `packages/widget/src/utils/event-stream-buffer.ts`:
  - Implement a class `EventStreamBuffer` with:
    - Constructor accepting `maxSize: number` (default 500)
    - Private `buffer: SSEEventRecord[]` array used as a ring buffer with a `head` pointer
    - `push(event: SSEEventRecord): void` - adds event, evicts oldest when at capacity
    - `getAll(): SSEEventRecord[]` - returns all events in chronological order
    - `getRecent(count: number): SSEEventRecord[]` - returns the N most recent events
    - `getSize(): number` - returns current event count
    - `getTotalCaptured(): number` - tracks total events ever captured (even after eviction)
    - `getEvictedCount(): number` - returns `totalCaptured - currentSize`
    - `clear(): void` - resets the buffer
    - `getEventTypes(): string[]` - returns unique event types seen so far (for filter dropdown)
    - Private `eventTypesSet: Set<string>` to track unique types efficiently
  - Keep the implementation simple and dependency-free
  - Each event stored as lightweight `SSEEventRecord` object - no deep cloning of payloads
  - **Note:** 9 unit tests added in `event-stream-buffer.test.ts` covering push, eviction, wrapping, clear, event types, getRecent, and default capacity.

- [x] Create the event capture tap in the SSE streaming pipeline:
  - In `packages/widget/src/client.ts`, add an optional `onSSEEvent` callback parameter to the `AgentWidgetClient` constructor config (add it as a private field)
  - Define the callback type: `type SSEEventCallback = (eventType: string, payload: unknown) => void`
  - In the `streamResponse` method, right after the `payload = JSON.parse(data)` line (around line 1167), call `this.onSSEEvent?.(payloadType, payload)` to tap into every parsed SSE event without disrupting the existing event processing flow
  - Make sure the tap happens BEFORE the custom SSE event handler check (`if (this.parseSSEEvent)`) so ALL events are captured regardless of custom handling
  - Add `SSEEventCallback` as an export from `client.ts` and re-export from `index.ts`
  - **Note:** Used `setSSEEventCallback()` method on both `AgentWidgetClient` and `AgentWidgetSession` for clean API surface instead of config mutation.

- [x] Create the event stream UI component at `packages/widget/src/components/event-stream-view.ts`:
  - Implement `createEventStreamView(buffer: EventStreamBuffer): { element: HTMLElement; update: () => void; destroy: () => void }`:
    - Create a container div with class `tvw-event-stream-view tvw-flex tvw-flex-col tvw-flex-1 tvw-min-h-0`
    - Create a toolbar div at the top with class `tvw-flex tvw-items-center tvw-gap-2 tvw-px-4 tvw-py-2 tvw-border-b tvw-border-cw-divider tvw-bg-cw-surface tvw-flex-shrink-0` containing:
      - A placeholder `<select>` element for event type filter (populated from `buffer.getEventTypes()`) with a "All Events" default option. Style: `tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-text-cw-primary`
      - A placeholder `<input>` for search with `placeholder="Search events..."`. Style: `tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-flex-1 tvw-text-cw-primary`
      - A "Copy All" button. Style: `tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer`
      - A "Clear" button with same styling as Copy All
    - Create a scrollable events list div with class `tvw-event-stream-list tvw-flex-1 tvw-overflow-y-auto tvw-min-h-0`
    - The `update()` method re-renders the event list from the buffer (simple DOM replacement for now - virtual scrolling comes in Phase 3)
    - Each event row is rendered by a `renderEventRow(event: SSEEventRecord)` helper:
      - Row container: `tvw-flex tvw-items-start tvw-gap-2 tvw-px-4 tvw-py-2 tvw-border-b tvw-border-cw-divider tvw-text-xs hover:tvw-bg-cw-container tvw-group`
      - Event type badge: `<span>` with `tvw-inline-block tvw-px-1.5 tvw-py-0.5 tvw-rounded tvw-text-[10px] tvw-font-mono tvw-font-medium tvw-bg-cw-accent/10 tvw-text-cw-accent tvw-whitespace-nowrap tvw-flex-shrink-0`
      - Timestamp: `<span>` with `tvw-text-cw-muted tvw-whitespace-nowrap tvw-flex-shrink-0 tvw-font-mono` showing `HH:MM:SS.mmm` format
      - Payload preview: `<pre>` with `tvw-text-cw-primary tvw-font-mono tvw-overflow-hidden tvw-text-ellipsis tvw-whitespace-nowrap tvw-flex-1 tvw-min-w-0 tvw-m-0` showing truncated JSON (first ~120 chars)
      - Copy button (visible on hover): `<button>` with `tvw-opacity-0 group-hover:tvw-opacity-100 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-flex-shrink-0 tvw-border-none tvw-bg-transparent tvw-p-0` using a clipboard icon from Lucide (`renderLucideIcon('clipboard', '14px', '', 1)`)
    - Implement the timestamp formatter: `formatTimestamp(ms: number): string` that formats as `HH:MM:SS.mmm` using the browser's local time
    - The Copy All button calls `navigator.clipboard.writeText(JSON.stringify(buffer.getAll(), null, 2))`
    - Individual copy button copies that single event's full payload JSON
    - The Clear button calls `buffer.clear()` then `update()`
    - The `destroy()` method removes event listeners and cleans up DOM references
    - Auto-scroll behavior: after `update()`, if the user was scrolled to the bottom (within 50px threshold), scroll to bottom. If user has scrolled up, don't auto-scroll.

- [x] Wire the event stream feature into the main UI controller (`packages/widget/src/ui.ts`):
  - Near the top where feature flags are read (around line 405-406 near `showReasoning` and `showToolCalls`), add: `let showEventStreamToggle = config.features?.showEventStreamToggle ?? false`
  - Create the buffer instance: `const eventStreamBuffer = showEventStreamToggle ? new EventStreamBuffer(500) : null`
  - When creating the `AgentWidgetSession`, pass the `onSSEEvent` callback through the client config to capture events into the buffer. The session creates the client internally, so you need to modify the config object passed to the session to include `onSSEEvent`. Add the callback that creates `SSEEventRecord` objects and pushes them to the buffer:
    ```
    if (eventStreamBuffer) {
      config = { ...config, __onSSEEvent: (type, payload) => {
        eventStreamBuffer.push({
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type,
          timestamp: Date.now(),
          payload: JSON.stringify(payload)
        });
      }};
    }
    ```
    Note: Since `onSSEEvent` is not on the public config type, use a private internal approach - add it directly to the client constructor or pass it through the session. The cleanest approach is to add a `setSSEEventCallback` method on `AgentWidgetSession` that forwards to the client, or to add `onSSEEvent` as an internal-only property on the config that the client reads.
  - Create the event stream view (lazily, on first toggle): `let eventStreamView: ReturnType<typeof createEventStreamView> | null = null`
  - Track the view state: `let eventStreamVisible = false`
  - Add a header toggle button for the event stream:
    - After the header is built (around line 500-520 area where header plugins are processed), if `showEventStreamToggle` is true, create a toggle button:
      - Use Lucide icon `activity` (or `radio` for SSE concept), size 18px
      - Style: `tvw-inline-flex tvw-items-center tvw-justify-center tvw-rounded-full tvw-text-cw-muted hover:tvw-bg-gray-100 tvw-cursor-pointer tvw-border-none tvw-p-1`
      - Size: 28x28px
      - Tooltip: "Event Stream"
      - Insert it into the header before the clear chat button wrapper (or close button wrapper if no clear chat)
  - Implement the toggle logic:
    - `showEventStream()`: Set `eventStreamVisible = true`. Lazily create the view if needed. Hide `body` (the scrollable messages area) by setting `body.style.display = 'none'`. Insert `eventStreamView.element` before the footer. Call `eventStreamView.update()`. Update toggle button visual (e.g., add active color).
    - `hideEventStream()`: Set `eventStreamVisible = false`. Remove `eventStreamView.element` from the DOM (but keep reference for re-show). Show `body` by removing `body.style.display`. Update toggle button visual.
  - Set up an update interval: When the event stream view is visible, use `setInterval` at ~250ms to call `eventStreamView.update()` to show new events. Clear the interval when hidden. Store the interval ID and clean it up on destroy.
  - Add to `destroyCallbacks`: clean up the event stream view, clear the interval, and clear the buffer

- [x] Add the necessary imports and verify the build compiles:
  - In `packages/widget/src/ui.ts`, add import for `EventStreamBuffer` from `./utils/event-stream-buffer`
  - In `packages/widget/src/ui.ts`, add import for `createEventStreamView` from `./components/event-stream-view`
  - In `packages/widget/src/ui.ts`, add import for `SSEEventRecord` from `./types`
  - Ensure `packages/widget/src/client.ts` properly integrates the `onSSEEvent` callback
  - Run `pnpm build:widget` from the repo root to verify compilation succeeds

- [x] Test the feature manually with the dev server:
  - Run `pnpm dev` from the repo root
  - Open the widget demo at http://localhost:5173
  - Verify the event stream toggle icon appears in the header when the feature flag is enabled in the demo config
  - Send a message and verify events are captured
  - Click the toggle to switch to event stream view
  - Verify events display with type badge, timestamp, and payload
  - Click toggle again to return to normal chat
  - Verify chat messages are preserved
  - If the demo config doesn't have the feature flag enabled, check the example app config in `examples/embedded-app/` and add `features: { showEventStreamToggle: true }` to the widget config there
  - **Note:** Enabled `features: { showEventStreamToggle: true }` in both inline and launcher widget configs in `examples/embedded-app/src/main.ts`. Verified: all 91 tests pass, widget build succeeds (ESM/CJS/IIFE/DTS), typecheck passes. Feature is now ready for interactive browser testing with `pnpm dev`.
