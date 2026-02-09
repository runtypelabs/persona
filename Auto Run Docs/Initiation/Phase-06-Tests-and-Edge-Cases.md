# Phase 06: Tests and Edge Cases

This phase adds comprehensive unit tests for the event stream feature and handles edge cases that could cause issues in production: session resets, widget destroy cleanup, rapid event bursts, IndexedDB failures, and expandable JSON payloads. Tests follow the existing Vitest patterns used in the codebase.

## Tasks

- [x] Write unit tests for the EventStreamBuffer at `packages/widget/src/utils/event-stream-buffer.test.ts`:
  - Test basic push and retrieval:
    - Push events, verify `getAll()` returns them in order
    - Verify `getSize()` returns correct count
  - Test ring buffer eviction:
    - Push more events than `maxSize`
    - Verify `getAll()` only contains the most recent `maxSize` events
    - Verify `getTotalCaptured()` returns the full count
    - Verify `getEvictedCount()` is `totalCaptured - maxSize`
  - Test `getRecent(n)`:
    - Push 100 events, call `getRecent(10)`, verify it returns the 10 most recent
    - When buffer has fewer than N events, returns all events
  - Test `getEventTypes()`:
    - Push events with different types, verify all unique types are returned
    - Verify types persist after eviction
  - Test `clear()`:
    - Push events, call `clear()`, verify buffer is empty
    - Verify `getTotalCaptured()` resets to 0

- [x] Write unit tests for the EventStreamStore at `packages/widget/src/utils/event-stream-store.test.ts`:
  - Use the `fake-indexeddb` package or mock IndexedDB for testing (check if it's already in dev dependencies, if not add it)
  - Test basic CRUD:
    - Open the store, put an event, getAll returns it
    - Put multiple events, getAll returns all in order
    - getCount returns correct number
  - Test batch writes:
    - putBatch with 100 events, verify all are stored
  - Test clear:
    - Put events, clear, getAll returns empty array
  - Test destroy:
    - Open, put events, destroy, verify DB is deleted
  - Test error handling:
    - If IndexedDB is unavailable, verify no errors thrown and operations are no-ops

- [x] Write unit tests for the VirtualScroller at `packages/widget/src/utils/virtual-scroller.test.ts`:
  - Mock the DOM container with a fixed size (e.g., 400px height)
  - Test row rendering:
    - Set total count to 100, verify only ~10-15 rows are in the DOM (400px / 40px row height + overscan)
  - Test scroll position calculation:
    - Set scrollTop to 200, verify the correct range of rows are rendered
  - Test `isNearBottom()`:
    - At bottom: returns true
    - Scrolled up: returns false
  - Test `setTotalCount()`:
    - Increase count, verify spacer height updates
    - Decrease count, verify spacer height updates and excess rows removed

- [x] Write integration tests for the event capture pipeline at `packages/widget/src/utils/event-stream-capture.test.ts`:
  - Test that the `onSSEEvent` callback fires for each event type:
    - Mock a stream with `step_chunk`, `tool_start`, `flow_complete` events
    - Verify the callback is called with correct event type and payload for each
  - Test that event capture doesn't interfere with normal message processing:
    - Verify that the assistant message is still created correctly
    - Verify that tool calls still display properly
  <!-- Completed: 9 tests covering callback firing for all event types, multi-event streams, payload type resolution, non-interference with message/tool processing, no-callback mode, and callback error resilience -->

- [x] Handle edge case: widget destroy with active IndexedDB writes:
  - In `packages/widget/src/utils/event-stream-store.ts`:
    - Add an `isDestroyed` flag that prevents new writes after `destroy()` is called
    - In `flushWrites()`, check `isDestroyed` before attempting to write
    - In `destroy()`, set `isDestroyed = true`, then flush any remaining writes, then close and delete the DB
  - In `packages/widget/src/ui.ts`:
    - In the destroy callback, call `eventStreamBuffer?.destroy()` which chains to the store
    - Null out the buffer and view references to prevent memory leaks
  <!-- Completed: Added isDestroyed flag to EventStreamStore (checked in put, putBatch, flushWrites); updated destroy() to set flag and discard pending writes before closing DB; updated EventStreamBuffer.destroy() to clear internal state and chain to store; updated ui.ts destroy callback to use buffer.destroy() and null out references; added 5 new tests (3 store, 2 buffer) -->

- [x] Handle edge case: session reset / clear chat:
  - When `clearChat()` is called in `packages/widget/src/ui.ts`:
    - Clear the event stream buffer: `eventStreamBuffer?.clear()`
    - This cascades to clear IndexedDB via the buffer's store reference
    - If the event stream view is visible, call `eventStreamView?.update()` to reflect the empty state
  - When the widget session is reset (new session):
    - The buffer persists across session resets (same widget instance)
    - Only clear on explicit `clearChat()` or widget destroy
  <!-- Completed: Verified existing implementation already handles this correctly — both clearChat button handler (line 2400) and controller clearChat() (line 3658) call eventStreamBuffer?.clear() and eventStreamView?.update(). Buffer persists across session resets (session.clearMessages doesn't touch event stream). Added 4 new tests: 2 buffer tests (accept events after clear, retain events across session resets) and 2 view tests (empty state after clear+update, recovery when new events arrive after clear). All 192 tests pass. -->

- [ ] Handle edge case: rapid event bursts (e.g., fast streaming with many step_chunk events):
  - In `packages/widget/src/components/event-stream-view.ts`:
    - The `update()` method should have a built-in throttle: skip the update if less than 100ms since the last render
    - Use a `pendingUpdate` flag and `requestAnimationFrame` to coalesce rapid updates
  - In `packages/widget/src/utils/event-stream-buffer.ts`:
    - The ring buffer `push()` is already O(1) by design (overwrite at head pointer)
    - No additional optimization needed for the buffer itself

- [ ] Handle edge case: expandable JSON payloads in event rows:
  - In `packages/widget/src/components/event-stream-view.ts`, update `renderEventRow()`:
    - The payload preview shows truncated JSON (first ~120 chars with ellipsis) by default
    - Add a click handler on the payload `<pre>` element:
      - On click, toggle between truncated and full view
      - When expanded: remove `tvw-whitespace-nowrap tvw-overflow-hidden tvw-text-ellipsis` classes, add `tvw-whitespace-pre-wrap tvw-break-all`
      - Show the full formatted JSON: `JSON.stringify(JSON.parse(event.payload), null, 2)`
      - When collapsed: revert to truncated view
    - The expanded state does NOT need to survive virtual scroller recycling (expanding a row is a quick inspection, not a persistent state)
    - Note: Since rows are fixed height for virtual scrolling, expanded rows will need special handling. The simplest approach: when a row is expanded, overlay the full JSON in a fixed-position popup/tooltip near the row, rather than changing the row height. This avoids breaking the virtual scroller's fixed-height assumption.
    - Implement the expansion as a floating panel:
      - Create a `<div>` with class `tvw-absolute tvw-z-20 tvw-bg-cw-surface tvw-border tvw-border-cw-border tvw-rounded-lg tvw-shadow-lg tvw-p-3 tvw-text-xs tvw-font-mono tvw-max-w-[500px] tvw-max-h-[300px] tvw-overflow-auto`
      - Position it below or above the clicked row (whichever has more space)
      - Dismiss on: click outside, Escape key, scroll
      - Include a small copy button in the top-right corner of the floating panel

- [ ] Run `pnpm test:run` from `packages/widget/` to run all tests and verify everything passes

- [ ] Run `pnpm build:widget` and `pnpm typecheck` from the repo root to verify final build and type checking pass

- [ ] Create a changeset for the new feature:
  - Run `pnpm changeset` from the repo root
  - Select `@runtypelabs/persona` (the widget package) as the changed package
  - Select `minor` as the bump type (new feature)
  - Description: "Add SSE Event Stream Inspector - a debug panel that shows raw SSE events with filtering, search, virtual scrolling, IndexedDB persistence, and programmatic control via controller methods and window events"
