# Phase 04: SDK Integration and Programmatic Control

This phase adds the full programmatic SDK surface for the event stream inspector: controller methods (`showEventStream()` / `hideEventStream()`), instance-scoped window events (`persona:{instanceId}:showEventStream` / `persona:{instanceId}:hideEventStream`), and controller event emissions. This allows SDK users to programmatically trigger the event stream panel on specific widget instances, listen for state changes, and integrate the debug tool into their development workflows.

## Tasks

- [x] Add event stream controller methods to the Controller type and implementation in `packages/widget/src/ui.ts`:
  - Add to the `Controller` type definition (around line 147-202):
    - `showEventStream: () => void` - Opens the event stream panel
    - `hideEventStream: () => void` - Closes the event stream panel
    - `isEventStreamVisible: () => boolean` - Returns current visibility state
  - Implement these methods in the `controller` object (around line 2284):
    - `showEventStream()`:
      - If `!showEventStreamToggle` or `!eventStreamBuffer`, return early (feature not enabled)
      - Call the existing `showEventStream()` internal function (the one that toggles the view)
    - `hideEventStream()`:
      - If `!eventStreamVisible`, return early
      - Call the existing `hideEventStream()` internal function
    - `isEventStreamVisible()`:
      - Return `eventStreamVisible`
  - Rename the internal toggle functions to avoid collision: use `toggleEventStreamOn()` / `toggleEventStreamOff()` internally, keep controller methods as `showEventStream` / `hideEventStream`

- [x] Add event stream events to the controller event map in `packages/widget/src/types.ts`:
  - Add to `AgentWidgetControllerEventMap`:
    - `"eventStream:opened": { timestamp: number }` - Fired when event stream panel opens
    - `"eventStream:closed": { timestamp: number }` - Fired when event stream panel closes
  - Emit these events from the internal toggle functions:
    - In `toggleEventStreamOn()`: `eventBus.emit("eventStream:opened", { timestamp: Date.now() })`
    - In `toggleEventStreamOff()`: `eventBus.emit("eventStream:closed", { timestamp: Date.now() })`

- [x] Add instance-scoped window event listeners for programmatic control:
  - In `packages/widget/src/ui.ts`, after the controller is created (near the debug API section around line 3670):
    - Generate an instance ID: use the existing widget mount's ID or generate one: `const instanceId = mount.id || 'persona-' + Math.random().toString(36).slice(2, 8)`
    - Register window event listeners for the show/hide events:
      ```
      const handleShowEvent = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        // If no instanceId in detail, or instanceId matches this instance
        if (!detail?.instanceId || detail.instanceId === instanceId) {
          controller.showEventStream();
        }
      };
      const handleHideEvent = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail?.instanceId || detail.instanceId === instanceId) {
          controller.hideEventStream();
        }
      };
      ```
    - Listen on window:
      ```
      window.addEventListener('persona:showEventStream', handleShowEvent);
      window.addEventListener('persona:hideEventStream', handleHideEvent);
      ```
    - Only register these listeners if `showEventStreamToggle` is true
    - Add cleanup to `destroyCallbacks`:
      ```
      destroyCallbacks.push(() => {
        window.removeEventListener('persona:showEventStream', handleShowEvent);
        window.removeEventListener('persona:hideEventStream', handleHideEvent);
      });
      ```
  - The window events accept an optional `instanceId` in the `detail` property of a `CustomEvent`:
    - `window.dispatchEvent(new CustomEvent('persona:showEventStream', { detail: { instanceId: 'persona-root' } }))`
    - If `instanceId` is omitted, ALL instances respond (useful for single-widget pages)
    - If `instanceId` is provided, only the matching instance responds

- [x] Export the new controller methods and event types from `packages/widget/src/index.ts`:
  - The controller methods are already part of `AgentWidgetController` type (which is exported as `Controller` from `ui.ts`)
  - Ensure the new event map entries are visible to TypeScript consumers by verifying the `AgentWidgetControllerEventMap` export includes the new keys
  - No new exports needed beyond the type updates since the controller type already flows through
  - **Note:** Also added `AgentWidgetControllerEventMap` to the re-exports from `index.ts` so TypeScript consumers can directly import it.

- [x] Update the controller's `update()` method to handle dynamic toggling of the feature flag:
  - In the `update(nextConfig)` method (around line 2285):
    - Read the new flag value: `const newShowEventStreamToggle = config.features?.showEventStreamToggle ?? false`
    - If the flag changed from false to true:
      - Create the buffer and store if they don't exist
      - Register the SSE event callback
      - Add the header toggle button
    - If the flag changed from true to false:
      - Hide the event stream view if visible
      - Remove the header toggle button
      - Clean up the buffer and store
    - Update `showEventStreamToggle` to the new value

- [x] Run `pnpm build:widget` to verify compilation

- [ ] Test programmatic control:
  - Run `pnpm dev` and open the widget demo
  - Open browser DevTools console
  - Test controller methods:
    - Access the controller (via `window.AgentWidgetBrowser.controller` if debug mode is enabled, or via the variable stored by `windowKey`)
    - Call `controller.showEventStream()` - verify panel opens
    - Call `controller.hideEventStream()` - verify panel closes
    - Call `controller.isEventStreamVisible()` - verify returns correct boolean
  - Test window events:
    - `window.dispatchEvent(new CustomEvent('persona:showEventStream'))` - verify panel opens
    - `window.dispatchEvent(new CustomEvent('persona:hideEventStream'))` - verify panel closes
  - Test instance scoping:
    - `window.dispatchEvent(new CustomEvent('persona:showEventStream', { detail: { instanceId: 'persona-root' } }))` - should work
    - `window.dispatchEvent(new CustomEvent('persona:showEventStream', { detail: { instanceId: 'wrong-id' } }))` - should NOT work
  - Test event listener:
    - `controller.on('eventStream:opened', (e) => console.log('opened', e))` - verify fires on open
    - `controller.on('eventStream:closed', (e) => console.log('closed', e))` - verify fires on close
