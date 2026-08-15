---
"@runtypelabs/persona": minor
---

Add a 200ms hover delay (and 300ms skip-delay) to control tooltips and expose it as `tooltip.delayMs` / `tooltip.skipDelayMs`. Keyboard focus still opens immediately. Set `delayMs: 0` to keep the previous instant-open behavior.
