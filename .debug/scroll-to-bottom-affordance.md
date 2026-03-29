# Debug: scroll-to-bottom-affordance

## Status
Fixed

## Symptoms
- Scroll-to-bottom affordance does not appear in the fullscreen assistant demo even when transcript content is long enough to scroll.
- The widget config enables `features.scrollToBottom`, but the control is not visible in the rendered UI.

## Reproduction
1. Render a non-launcher widget with enough transcript content to overflow.
2. Scroll upward to break auto-follow while streaming continues.
3. Observe that the scroll-to-bottom affordance is present in DOM state but not visible in the viewport.

## Hypotheses

### Active
- [ ] The control is mounted inside the scrollable transcript container, so its absolute positioning tracks the content box instead of the visible viewport edge.

### Eliminated
- [x] The feature is disabled by config: eliminated because `DEFAULT_WIDGET_CONFIG.features.scrollToBottom.enabled` defaults to `true` and the fullscreen demo explicitly sets it.
- [x] The fullscreen demo lacks enough transcript content: eliminated because the user reproduced the issue with a long transcript.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Read `packages/widget/src/ui.scroll.test.ts` and defaults tests | Tests only assert the button exists in the DOM after pausing auto-follow | Current coverage does not verify visual anchoring |
| 2 | Read `packages/widget/src/ui.ts` | `scrollToBottomButton` is appended to `body` | The affordance is mounted inside the scrollable transcript container |
| 3 | Read `packages/widget/src/components/panel.ts` | `body` is `overflow-y-auto` and is the transcript scroll container | Absolutely positioned descendants can scroll out of view with the transcript |

## Root Cause
**Verification level:** Corroborated

The transcript scroll-to-bottom affordance is mounted as an absolutely positioned child of the scrollable transcript body. When the user scrolls away from the bottom, the control can remain logically enabled while its position is tied to the scrolled content instead of the visible pane.

## Fix
- Move the transcript affordance out of the scrollable transcript body and mount it on the non-scrolling container instead.
- Recompute its bottom offset from the current footer height so it stays above the default composer and custom composer plugins.
- Hide the transcript affordance while the event stream view is active, since that view has its own scroll handling.

## Resolution
- Added regression tests that fail when the affordance is mounted inside the scroll container, including a custom composer case.
- Verified with `pnpm --filter @runtypelabs/persona test:run src/ui.scroll.test.ts`.
- Verified with `pnpm --filter @runtypelabs/persona lint`.
- Verified with `pnpm --filter @runtypelabs/persona typecheck`.
