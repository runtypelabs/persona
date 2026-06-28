---
"@runtypelabs/persona": minor
---

Add four additive, opt-in scroll/transcript polish features inspired by shadcn's chat-components thread:

- **`features.scrollBehavior.edgeFade`** (`"top" | "bottom" | "both" | true`) — a soft gradient "scroll-fade" mask at the transcript edges so content dissolves under the header/composer instead of hard-clipping. Default off.
- **`features.scrollBehavior.visibilityTracking`** — observe message bubbles with an `IntersectionObserver`; the first time each scrolls into view it gets `data-persona-message-seen="true"` and emits a new `message:visible` controller event. Default off; no-op where `IntersectionObserver` is unavailable.
- **`features.messageEntrance`** (`{ enabled, mode: "fade" | "slide-up", durationMs }`) — a one-shot entrance animation for newly-rendered message bubbles. Restored history never animates; honors `prefers-reduced-motion`. Default off.
- **`controller.scrollToMessage(id, { block, behavior })`** — jump a specific message into view (near the top or centered), pausing follow since the target is above the live edge.

Also ships a reusable **`persona-shimmer-skeleton`** utility class for height-reserving loading placeholders (pending embeds, late images, tool-result cards).

All four default to historical behavior; existing embeds are unaffected.
