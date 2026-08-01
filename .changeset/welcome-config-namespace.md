---
"@runtypelabs/persona": minor
---

Add the `welcome` config namespace: `title`, `subtitle`, `icon` (lucide, image, text, or function), `variant` (`card` | `hero` | `none`), `dismiss` (`never` | `on-first-message`), and a display-only `message` greeting bubble.

- `resolveWelcomeConfig` is the single source of truth. Precedence is per field and presence-based: `welcome.*` wins, else the legacy `copy.welcomeTitle` / `copy.welcomeSubtitle` / `copy.showWelcomeCard` alias, else the resolver default. Those legacy fields still work and are now marked deprecated.
- The welcome defaults moved out of `DEFAULT_WIDGET_CONFIG` and into the resolver, so an explicit-`undefined` patch resets a field instead of resolving to a materialized default. The default subtitle copy changed to "I can answer questions and help you get things done here."
- `variant: "hero"` centers the surface in the empty conversation and dismisses it on the first user message (WAAPI, so morph re-renders cannot cancel it). Visibility is derived from the transcript and never stored, so it returns after `clearChat()`.
- `welcome.message` renders an assistant-styled bubble pinned above the transcript. It is config-derived chrome: never in `getMessages()`, never sent to the model, never persisted, and it survives `clearChat()`. It is suppressed under `variant: "hero"`.
- Every field responds to `controller.update({ welcome })`. Starter cards render inside whichever surface is active, capped at two columns and centered under `hero`.
- An empty subtitle now omits the paragraph and its top margin instead of rendering an empty one.
- At wide panel widths the welcome surface is a centered, width-capped column (640px) with its text left-aligned inside; at launcher width the cap never engages. The plugin overlay stays full-bleed.
