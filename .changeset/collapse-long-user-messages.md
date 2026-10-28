---
"@runtypelabs/persona": minor
---

Add `features.userMessageCollapse`: long user messages (pasted text, voice transcripts) collapse to `maxHeight` (default 240px, about ten lines) behind a "Show more" / "Show less" button, so a long sent message no longer fills the viewport above the reply in `anchor-top` mode. The height is measured from the rendered content, the full text stays in the DOM, interim voice transcripts stay expanded until final, and toggling counts as reader input that holds the bubble in place. Labels come from `copy.showMoreLabel` / `copy.showLessLabel`, and the fade and toggle take optional `theme.components.userMessageCollapse` tokens. Off by default; on under `future.v5Defaults`. Custom `renderUserMessage` and plugin `renderMessage` bubbles are unchanged.
