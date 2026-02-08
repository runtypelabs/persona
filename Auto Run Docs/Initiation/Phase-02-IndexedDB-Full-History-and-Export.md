# Phase 02: IndexedDB Full History and Export

This phase adds the IndexedDB persistence layer so that all SSE events are stored to disk, enabling full session export even after old events have been evicted from the in-memory ring buffer. The "Copy All" button will pull from IndexedDB for complete history, while the live UI continues to use the fast ring buffer. This is the dual-layer storage architecture that makes the feature production-ready for long agent loop debugging sessions.

## Tasks

- [x] Create the IndexedDB persistence module at `packages/widget/src/utils/event-stream-store.ts`:
  - Implement a class `EventStreamStore` with:
    - Constructor accepting `dbName: string` (default `'persona-event-stream'`) and `storeName: string` (default `'events'`)
    - Private `db: IDBDatabase | null` field
    - `open(): Promise<void>` - opens/creates the IndexedDB database with an object store using `id` as keyPath and an index on `timestamp`
    - `put(event: SSEEventRecord): void` - writes a single event asynchronously (fire-and-forget, no await needed for the live capture path). Use a transaction with `readwrite` mode. Buffer writes using `queueMicrotask` to batch them when events arrive rapidly.
    - `putBatch(events: SSEEventRecord[]): void` - writes multiple events in a single transaction (used for catch-up if needed)
    - `getAll(): Promise<SSEEventRecord[]>` - retrieves all events ordered by timestamp
    - `getCount(): Promise<number>` - returns total event count
    - `clear(): Promise<void>` - deletes all events from the store
    - `close(): void` - closes the database connection
    - `destroy(): Promise<void>` - closes the connection and deletes the entire database
  - Handle IndexedDB errors gracefully - if IndexedDB is unavailable (e.g., private browsing in some browsers), log a warning and degrade to ring-buffer-only mode (no exports of evicted events)
  - Use a write queue pattern to avoid overwhelming IndexedDB during rapid event bursts:
    - Maintain a `pendingWrites: SSEEventRecord[]` array
    - When `put()` is called, push to `pendingWrites` and schedule a flush via `queueMicrotask` if not already scheduled
    - `flushWrites()` method: opens a single `readwrite` transaction and writes all pending events, then clears the array
  - Import `SSEEventRecord` type from `../types`

- [x] Integrate the IndexedDB store into the event stream buffer (`packages/widget/src/utils/event-stream-buffer.ts`):
  - Add an optional `store: EventStreamStore | null` parameter to the `EventStreamBuffer` constructor
  - In the `push()` method, if a store exists, also call `store.put(event)` after adding to the ring buffer
  - In the `clear()` method, if a store exists, also call `store.clear()`
  - Add a new method `getAllFromStore(): Promise<SSEEventRecord[]>` that returns `store.getAll()` if a store exists, or falls back to `this.getAll()` (ring buffer only)
  - Add a `destroy()` method that calls `store?.destroy()` to clean up the database on widget teardown

- [x] Update the "Copy All" button in the event stream view to use full IndexedDB history:
  - In `packages/widget/src/components/event-stream-view.ts`, change the `createEventStreamView` function signature to also accept a reference to the buffer's async export:
    - Add parameter: `getFullHistory: () => Promise<SSEEventRecord[]>`
  - Update the "Copy All" button click handler:
    - Show a brief loading state on the button (change text to "Copying..." or add a small spinner)
    - Call `const allEvents = await getFullHistory()`
    - Format as JSON: `JSON.stringify(allEvents, null, 2)`
    - Copy to clipboard via `navigator.clipboard.writeText()`
    - Show brief success state (change text to "Copied!" for 1.5 seconds, then revert)
    - Handle errors by showing "Failed" text briefly

- [x] Wire the IndexedDB store into the UI controller (`packages/widget/src/ui.ts`):
  - Import `EventStreamStore` from `./utils/event-stream-store`
  - When `showEventStreamToggle` is true, create the store:
    ```
    const eventStreamStore = showEventStreamToggle ? new EventStreamStore() : null
    ```
  - Open the store asynchronously at init time (don't block the UI):
    ```
    eventStreamStore?.open().catch(err => {
      if (config.debug) console.warn('[AgentWidget] IndexedDB not available for event stream:', err)
    })
    ```
  - Pass the store to the `EventStreamBuffer` constructor
  - When creating the event stream view, pass the full history getter:
    ```
    createEventStreamView(eventStreamBuffer, () => eventStreamBuffer.getAllFromStore())
    ```
  - In the destroy callbacks, add `eventStreamStore?.destroy()` to clean up the database
  - In the `clearChat()` handler, also clear the event stream store

- [x] Run `pnpm build:widget` to verify the build compiles with the IndexedDB integration

- [x] Test IndexedDB persistence manually (requires human interaction) — **Skipped by automated agent: this task explicitly requires human interaction. Build compiles successfully and all 109 automated tests pass (6 test files). A human tester should complete the manual verification steps below.**
  - Run `pnpm dev` and open the widget demo
  - Enable the event stream feature flag
  - Send multiple messages to generate events
  - Open the event stream view and verify events show
  - Click "Copy All" and paste the JSON somewhere to verify it contains all events
  - Send many more messages (aim for 500+ events to test ring buffer eviction)
  - Verify "Copy All" still exports the full history from IndexedDB (more events than the 500 visible in the ring buffer)
  - Click "Clear" and verify both the view and the database are cleared
