# Phase 03: Virtual Scrolling and Performance

This phase replaces the simple DOM rendering of event rows with a custom lightweight virtual scroller. Instead of creating DOM nodes for all 500 buffered events, only the ~25-30 visible rows are rendered at any time. This is critical for performance during long agent loop sessions where hundreds of events accumulate rapidly. The scroller uses fixed-height rows with a spacer element for total height, and recycles DOM elements as the user scrolls. No new dependencies are added.

## Tasks

- [x] Create the virtual scroller module at `packages/widget/src/utils/virtual-scroller.ts`:
  - Implement a class `VirtualScroller` with:
    - Constructor accepting:
      - `container: HTMLElement` - the scrollable container
      - `rowHeight: number` (default 40) - fixed height per row in pixels
      - `overscan: number` (default 5) - extra rows to render above/below viewport for smooth scrolling
      - `renderRow: (index: number) => HTMLElement` - callback to create/update a row DOM element
    - Private fields:
      - `totalCount: number` - total number of items
      - `spacer: HTMLElement` - tall div that provides the full scrollable height
      - `viewport: HTMLElement` - the container for visible row elements
      - `visibleRows: Map<number, HTMLElement>` - currently rendered row elements keyed by index
      - `scrollRAF: number | null` - requestAnimationFrame ID for throttling
      - `isAutoScrolling: boolean` - tracks programmatic scrolling
    - Methods:
      - `setTotalCount(count: number): void` - updates total item count, recalculates spacer height (`count * rowHeight`), triggers re-render
      - `render(): void` - calculates visible range from `container.scrollTop / rowHeight`, creates/removes rows as needed, positions them with `transform: translateY(${index * rowHeight}px)`
      - `scrollToBottom(smooth?: boolean): void` - scrolls container to the end, sets `isAutoScrolling` flag
      - `isNearBottom(threshold?: number): boolean` - returns true if scrolled within threshold pixels of the bottom (default 50px)
      - `destroy(): void` - removes scroll listener, clears animation frame, removes DOM elements
    - Initialization:
      - Create `spacer` div with `position: relative; width: 100%`
      - Create `viewport` div with `position: absolute; top: 0; left: 0; right: 0`
      - Append viewport inside spacer, append spacer to container
      - Attach `scroll` event listener on container that calls `render()` via `requestAnimationFrame` (throttled to one RAF per scroll event)
    - Row management in `render()`:
      - Calculate `startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)`
      - Calculate `endIndex = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan)`
      - For each index in `[startIndex, endIndex)`:
        - If not in `visibleRows`, call `renderRow(index)`, set its style to `position: absolute; top: 0; left: 0; right: 0; height: ${rowHeight}px; transform: translateY(${index * rowHeight}px)`, add to viewport and to `visibleRows` map
      - For each index in `visibleRows` that's outside `[startIndex, endIndex)`:
        - Remove the DOM element and delete from `visibleRows` map

- [x] Refactor the event stream view to use the virtual scroller:
  - In `packages/widget/src/components/event-stream-view.ts`:
    - Import `VirtualScroller` from `../utils/virtual-scroller`
    - Replace the simple events list div with the virtual scroller setup:
      - The events list container keeps class `tvw-event-stream-list tvw-flex-1 tvw-overflow-y-auto tvw-min-h-0` with added `tvw-relative`
      - Create a `VirtualScroller` instance with `rowHeight: 40`, `overscan: 5`
      - The `renderRow` callback creates the event row element using the existing `renderEventRow()` helper, looking up the event from a filtered events array by index
    - Maintain a `filteredEvents: SSEEventRecord[]` array that is the current view of events (after applying type filter and search - full filter/search is Phase 5, but the array structure supports it now)
    - Update the `update()` method:
      - Get events from buffer: `filteredEvents = buffer.getAll()` (later phases will apply filters)
      - Call `scroller.setTotalCount(filteredEvents.length)`
      - If was near bottom before update, call `scroller.scrollToBottom()`
    - Update `destroy()` to also call `scroller.destroy()`

- [x] Add auto-scroll behavior with scroll-up-to-pause:
  - In the event stream view, track auto-scroll state:
    - `let userScrolledUp = false`
    - Listen for `scroll` events on the list container
    - On scroll: if `scroller.isNearBottom()` becomes true, set `userScrolledUp = false`
    - On scroll: if the scroll was a user action (not programmatic) and not near bottom, set `userScrolledUp = true`
  - In `update()`: only auto-scroll if `!userScrolledUp`
  - Add a "scroll to bottom" indicator:
    - Create a small floating button/pill at the bottom of the events list when `userScrolledUp` is true
    - Show count of new events since user scrolled up: track `newEventsSincePause: number`
    - Text: "N new events" with a down-arrow icon
    - Style: `tvw-absolute tvw-bottom-3 tvw-left-1/2 tvw-transform tvw--translate-x-1/2 tvw-bg-cw-accent tvw-text-white tvw-text-xs tvw-px-3 tvw-py-1.5 tvw-rounded-full tvw-cursor-pointer tvw-shadow-md tvw-z-10 tvw-flex tvw-items-center tvw-gap-1`
    - On click: `scroller.scrollToBottom(true)`, reset `userScrolledUp = false` and `newEventsSincePause = 0`, hide indicator

- [x] Add truncation notice for evicted events:
  - In the event stream view, check `buffer.getEvictedCount()` on each update
  - If evicted count > 0, show a subtle banner at the top of the events list (above the first event row, not inside the virtual scroll):
    - Text: `"${evictedCount} older events not shown in live view (available via Copy All)"`
    - Style: `tvw-text-[10px] tvw-text-cw-muted tvw-text-center tvw-py-1 tvw-px-4 tvw-bg-cw-container tvw-border-b tvw-border-cw-divider tvw-italic`
  - This banner should be positioned above the virtual scroller container (not inside it), as a fixed element

- [x] Update the event stream update interval for better performance:
  - In `packages/widget/src/ui.ts`, change the update interval from a fixed 250ms `setInterval` to a smarter approach:
    - Use `requestAnimationFrame` when the view is visible, with a throttle of ~200ms between actual DOM updates
    - Track `lastUpdateTime` and `pendingUpdate` flag
    - On each animation frame: if `Date.now() - lastUpdateTime >= 200`, call `eventStreamView.update()` and reset the timer
    - This avoids rendering during heavy streaming when the browser is already busy

- [x] Run `pnpm build:widget` to verify compilation

- [x] Test virtual scrolling performance: *(skipped — requires manual browser interaction; all automated tests pass, build succeeds, typecheck passes)*
  - Run `pnpm dev` and open the widget demo
  - Enable event stream feature
  - Send messages to generate events until the buffer has 100+ events
  - Open the event stream view and verify smooth scrolling
  - Scroll up to verify auto-scroll pauses and the "new events" indicator appears
  - Click the indicator to scroll back to bottom
  - Verify the truncation notice appears after 500+ events
  - Check that the DOM only has ~30-40 row elements at any time (inspect with browser DevTools)
