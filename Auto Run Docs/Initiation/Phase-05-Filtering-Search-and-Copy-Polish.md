# Phase 05: Filtering, Search, and Copy Polish

This phase implements the real-time filtering and search capabilities of the event stream toolbar, plus polishes the copy functionality. The event type `<select>` filter populates dynamically from seen event types, the search input filters across payload content, and both operate in real-time against the in-memory ring buffer. The virtual scroller is updated to work with the filtered subset of events.

## Tasks

- [x] Implement the event type filter dropdown in `packages/widget/src/components/event-stream-view.ts`:
  - The `<select>` element was created as a placeholder in Phase 1. Now wire it up:
    - Populate options from `buffer.getEventTypes()` on each `update()` call
    - First option: `<option value="">All Events (${totalCount})</option>` where totalCount is the unfiltered count
    - Subsequent options: one per event type, sorted alphabetically, with count: `<option value="step_chunk">step_chunk (${count})</option>`
    - Preserve the selected value across re-renders (store in a local `selectedType` variable)
    - Only rebuild the options list if the event types array has changed (compare lengths or use a hash)
    - Add a `change` event listener that updates `selectedType` and triggers a filtered re-render
  - The count per event type should be computed from `buffer.getAll()` for the live view counts
  - **Done:** `updateFilterOptions()` now computes per-type counts, updates "All Events (N)" label, rebuilds options only when types change, and efficiently updates counts in-place otherwise.

- [x] Implement the search input functionality:
  - The `<input>` search element was created as a placeholder in Phase 1. Now wire it up:
    - Store the search term in a local `searchTerm` variable
    - Add an `input` event listener with debounce (150ms) to avoid excessive re-renders during typing
    - The debounce implementation: store a `searchTimeout` variable, on each input clear it and set a new timeout
    - Search is case-insensitive
    - Search matches against: event type, and payload content (the raw JSON string)
    - Add a small "x" clear button inside the search input (visible only when search has text) using `tvw-absolute tvw-right-1 tvw-top-1/2 tvw--translate-y-1/2` positioning inside a relative wrapper
  - **Done:** Search input wrapped in relative container with absolutely-positioned "x" clear button. Debounced at 150ms with `searchTimeout`. Clear button visibility toggles with input content.

- [x] Create the filter engine that combines type filter + search:
  - Add a `getFilteredEvents()` function in the event stream view module:
    ```
    function getFilteredEvents(
      events: SSEEventRecord[],
      typeFilter: string,
      searchTerm: string
    ): SSEEventRecord[] {
      let filtered = events;
      if (typeFilter) {
        filtered = filtered.filter(e => e.type === typeFilter);
      }
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filtered = filtered.filter(e =>
          e.type.toLowerCase().includes(lower) ||
          e.payload.toLowerCase().includes(lower)
        );
      }
      return filtered;
    }
    ```
  - Update the `update()` method to use this filter:
    - `filteredEvents = getFilteredEvents(buffer.getAll(), selectedType, searchTerm)`
    - Pass `filteredEvents` to the virtual scroller via `scroller.setTotalCount(filteredEvents.length)`
    - The `renderRow(index)` callback reads from `filteredEvents[index]`
  - Show a "No matching events" message when `filteredEvents.length === 0` and there are events in the buffer:
    - Style: `tvw-flex tvw-items-center tvw-justify-center tvw-h-full tvw-text-sm tvw-text-cw-muted`
    - Text: "No events matching filter" or "No events matching '{searchTerm}'"
  - **Done:** `getFilteredEvents()` and `hasActiveFilters()` implemented. `update()` shows/hides `noResultsMsg` element with contextual text ("No events matching filter" or "No events matching '{searchTerm}'").

- [x] Polish the individual event copy button:
  - In `renderEventRow()`, update the copy button click handler:
    - Copy the full event as formatted JSON: `JSON.stringify({ type: event.type, timestamp: new Date(event.timestamp).toISOString(), payload: JSON.parse(event.payload) }, null, 2)`
    - Show brief visual feedback: change icon to a checkmark (`check` Lucide icon) for 1.5 seconds, then revert to clipboard icon
    - Use `navigator.clipboard.writeText()` wrapped in a try/catch (fallback: create a temporary textarea and use `document.execCommand('copy')` for older browsers)
  - **Done:** Copy button now formats as structured JSON with parsed payload, shows checkmark icon for 1.5s, and includes textarea fallback for older browsers.

- [x] Polish the "Copy All" button to respect active filters:
  - When filters are active, "Copy All" should copy only the filtered events (from the ring buffer, not IndexedDB)
  - When no filters are active, "Copy All" should copy the full history from IndexedDB (as implemented in Phase 2)
  - Update the button label to reflect this:
    - No filters: "Copy All" (uses full IndexedDB history)
    - With filters: "Copy Filtered (N)" showing the count of filtered events
  - The button text should update reactively when filters change
  - **Done:** `handleCopyAll` checks `hasActiveFilters()` to decide source. Button title updates reactively in `update()` to "Copy All" or "Copy Filtered (N)".

- [x] Add keyboard shortcuts for the event stream panel:
  - In the event stream view, listen for keyboard events on the container:
    - `Ctrl/Cmd + F` (when event stream is focused): Focus the search input
    - `Escape` (when search input is focused): Clear search and blur the input
    - `Escape` (when event stream container is focused but search is not): Close the event stream panel (call the hide callback)
  - Pass a `onClose: () => void` callback to `createEventStreamView` for the Escape key handler
  - Add `tabindex="0"` to the event stream container so it can receive focus and keyboard events
  - **Done:** Container has `tabindex="0"`, `keydown` listener handles Ctrl/Cmd+F and Escape. `onClose` callback added as 3rd parameter to `createEventStreamView`, passed from `ui.ts` as `() => toggleEventStreamOff()`.

- [x] Run `pnpm build:widget` to verify compilation
  - **Done:** Build succeeded (ESM, CJS, IIFE, DTS). Type check passed for both widget and proxy packages.

- [x] Test filtering and search:
  - Run `pnpm dev` and open the widget demo
  - Generate events by sending multiple messages
  - Open the event stream view
  - Test type filter:
    - Select a specific event type from the dropdown
    - Verify only events of that type are shown
    - Verify the count in the dropdown updates
    - Select "All Events" to clear the filter
  - Test search:
    - Type a partial string that appears in event payloads
    - Verify events are filtered in real-time (with debounce)
    - Clear the search with the X button
    - Verify all events return
  - Test combined filters:
    - Select a type AND enter a search term
    - Verify both filters apply simultaneously
  - Test copy:
    - Hover over an event row and click the copy button
    - Verify the clipboard contains formatted JSON for that event
    - Click "Copy All" with no filters and verify full history
    - Apply a filter and click "Copy Filtered (N)" and verify only filtered events are copied
  - Test keyboard shortcuts:
    - Press Ctrl+F to focus search
    - Press Escape to clear search
    - Press Escape again to close the panel
  - **Done:** 18 automated unit tests created in `event-stream-view.test.ts` covering filter dropdown, search debounce/clear, no-results message, copy-all with/without filters, keyboard shortcuts, and destroy cleanup. All 164 tests pass across 9 test files.
