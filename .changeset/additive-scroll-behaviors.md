---
"@runtypelabs/persona": minor
---

Add additive, opt-in `features.scrollBehavior` options for scroll-engineering control. All default to the existing behavior, so nothing changes unless you opt in:

- `restorePosition: "last-user-turn"` — reopen a saved conversation with the last user message pinned near the top of the viewport instead of jumping to the absolute bottom.
- `pauseOnInteraction: true` — treat keyboard navigation (PageUp/PageDown/Home/End/arrows) and focusing a link/control inside the transcript as intent to stay put, pausing auto-follow (previously only wheel/scroll/text-selection did).
- `showActivityWhilePinned: true` — surface the "new messages below" count and a streaming-below hint (a `data-persona-scroll-to-bottom-streaming` attribute on the jump-to-latest affordance) even in `anchor-top` mode.
- `announce: true` — maintain a visually-hidden `aria-live="polite"` region that announces response start/finish and "N new messages below" at a calm, debounced cadence (never token-by-token).

Also exports the `AgentWidgetScrollMode`, `AgentWidgetScrollRestorePosition`, `AgentWidgetScrollBehaviorFeature`, `AgentWidgetScrollToBottomFeature`, and `AgentWidgetComponentRenderer` types from the package root.
