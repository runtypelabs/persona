---
"@runtypelabs/persona": minor
---

Add a detached panel appearance. `launcher.detachedPanel` renders the chat panel as an inset card with elevation in sidebar, docked, and inline embed modes, themed via the new `components.panel.inset` and `components.panel.canvasBackground` tokens. The artifact pane gains a matching `paneAppearance: "detached"` treatment that defaults on when the panel is detached.

In the desktop side-by-side layout, a detached split gives each surface its own perimeter instead of nesting a double card: the outer panel drops its union shadow (which used to wrap the chat column, the transparent gap, and the pane together) and the chat column gains its own matching card chrome beside the pane. In inline embeds, `paneAppearance: "detached"` also insets the whole split from its container edges (previously the outer margin required `launcher.detachedPanel`), matching docked and sidebar. Narrow-host drawer and mobile fullscreen are unchanged: the panel stays the single visible card.

Elevation customizes per card through `theme.components.panel.shadow`, and the new `features.artifacts.layout.chatShadow` (token `--persona-artifact-chat-shadow`) can keep the chat column flat while the artifact pane stays raised. It defaults to matching the pane elevation, so detached splits render unchanged unless set.
