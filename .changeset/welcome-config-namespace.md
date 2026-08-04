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
- The default flat welcome aligns with the conversation column: the card variant shares the transcript's content width (`layout.contentMaxWidth`) and drops the invisible card's horizontal padding so the title lines up with messages and composer. Themed intro cards (`components.introCard.background`/`.shadow`) keep their full interior padding, and the centered hero keeps a 640px column (left-aligned text inside; at launcher width the cap never engages). The greeting bubble follows the same width cap. The plugin overlay stays full-bleed.
- A welcome-only (empty) transcript rests at the top with no phantom scrollable space: the empty messages wrapper and zero-height anchor spacer no longer add flex-gap height below the welcome content, and the open/render auto-scroll plus the scroll-to-bottom affordance are gated on the transcript having messages.
- The hero dismiss fade plays to completion: post-send renders (assistant placeholder, streaming chunks) no longer hide the host mid-animation, the fade fills forwards instead of flashing back to full opacity, `clearChat()` cancels it before re-showing, and a reload restoring user messages hides the hero outright instead of animating it away after hydration.
- `layout.slots["body-top"]` resolves against `[data-persona-intro-card]` instead of a stale utility-class chain, so `defaultContent()` returns the intro card again and custom welcome content replaces it rather than stacking above it.
