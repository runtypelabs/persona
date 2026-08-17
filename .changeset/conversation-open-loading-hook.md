---
"@runtypelabs/persona": minor
---

Make the conversation-open transcript skeleton customizable. The stand-in shown while a conversation selected from the Messages list loads now routes through the same renderer chain as the streaming indicator: a plugin's `renderLoadingIndicator`, then `loadingIndicator.render` in config, then the default skeleton. Both receive a new `location: "conversation-open"` (with `streaming: false`); returning null falls through to the next renderer. Persona keeps the centered transcript column, the status role and announcement, and the composer gate around whatever the hook returns. The default skeleton also moved from inline styles to stylesheet classes (`persona-conversation-loading`, `-body`, `-bubble`, `-bubble--trailing`), so CSS-only restyling works and the pulse honors `prefers-reduced-motion` via the stylesheet.
