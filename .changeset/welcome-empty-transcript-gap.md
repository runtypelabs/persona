---
"@runtypelabs/persona": patch
---

Fixed phantom scrollable space below the welcome state. The empty messages wrapper and the zero-height anchor spacer still counted as flex children, so the body's gap added invisible height below the welcome content, forcing a needless scroll and surfacing the scroll-to-bottom arrow with nothing to jump to. Both are now dropped from the flex flow until they have content. The open/render auto-scroll and the jump affordance are also gated on the transcript having messages, so a welcome-only view rests at the top instead of opening scrolled to the bottom with the greeting clipped.
