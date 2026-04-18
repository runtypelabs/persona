---
"@runtypelabs/persona": patch
---

Header close button (`×`) no longer appears visibly smaller than its sibling action icons. Changes include:

- **Zero-padding default**: `launcher.closeButtonPaddingX` / `closeButtonPaddingY` now default to `"0px"` (matching `launcher.clearChat.paddingX/Y`). Without this, the browser's user-agent `<button>` padding ate into the border-box and shrank the effective content area relative to the clear-chat button.
- **Icon size bump**: Lucide's `x` glyph only occupies the middle 50% of its 24x24 viewBox, while other header icons (e.g. `refresh-cw`) fill ~75%. At the same SVG width the X rendered with ~2/3 the visible extent. The close icon is now rendered at a larger intrinsic size to compensate.
- **Alignment**: The close-button wrapper uses the same inline-flex centering as the clear-chat control so both header actions line up consistently in the flex row.
- **SVG rendering**: Header action icons (clear chat and close) use `display: block` on the SVG to drop inline-baseline spacing that could nudge icons off-center inside the button.
