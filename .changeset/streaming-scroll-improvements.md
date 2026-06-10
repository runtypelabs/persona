---
"@runtypelabs/persona": minor
---

Smarter scrolling during streamed responses:

- **Content-growth follow**: the transcript now stays pinned to the bottom when content grows without a render event — images and embeds finishing loading mid-stream, web fonts swapping, or the panel/composer resizing.
- **New scroll modes** via `features.scrollBehavior.mode`: `"follow"` (default, current behavior), `"anchor-top"` (on send, the user's message is pinned near the top of the viewport and the response streams in below it — no auto-scroll while reading), and `"none"`. `anchorTopOffset` tunes the anchored gap.
- **Selection-aware streaming**: auto-follow pauses while text is being selected in the transcript, so streaming no longer drags a selection out from under the cursor.
- **Scroll-on-send**: sending a message always returns the view to the latest content, even after scrolling up.
- **New-message badge**: the scroll-to-bottom affordance shows a count of messages that arrived while scrolled away (themeable via `--persona-scroll-to-bottom-count-bg` / `--persona-scroll-to-bottom-count-fg`).
- The transcript reserves its scrollbar gutter, eliminating the horizontal layout shift when the scrollbar first appears.
