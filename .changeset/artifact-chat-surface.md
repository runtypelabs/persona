---
"@runtypelabs/persona": minor
---

Add `features.artifacts.layout.chatSurface` for the detached pane appearance. `"flush"` renders the chat flat on the host page so only the artifact pane floats as a card, the elevation-on-the-pane-only reference composition; the default `"card"` keeps two matched cards.

Flush drops the whole chat card: no border, radius, or shadow, and no backdrop of its own. The container, messages body, and composer footer backgrounds go transparent (the footer's top hairline is dropped too), so the host page shows through behind the transcript, while element surfaces (message bubbles, cards, the composer input) keep the `surface` color. The wrapper paints `theme.components.panel.canvasBackground` (default transparent) as the single token coloring the backdrop behind both the flush chat and the floating pane. The outer panel squares its corners by default since it fills its container flush; an explicit `theme.components.panel.borderRadius` still wins.

Flush is a steady state: it applies whether or not an artifact pane is open, so opening or closing an artifact never flips the chat chrome. It only takes effect on an inline embed with the detached pane appearance; floating, docked, and sidebar modes fall back to the card look.
