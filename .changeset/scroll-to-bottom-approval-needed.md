---
"@runtypelabs/persona": minor
---

The jump-to-latest control now says "Approval needed" when a pending approval is below the fold. It widens to a labelled pill with the approval's shield glyph instead of scrolling the reader there. Activating it jumps to the latest content and focuses the approval's primary action. Persona also no longer moves focus to an approval the reader can't see. Configure the text with `features.scrollToBottom.approvalLabel` (empty string keeps the regular control). Style it with `theme.components.scrollToBottom.approval` (`background`, `foreground`, `border`, `fontWeight`), which defaults to the control's own colors. Custom `renderIcon` glyphs see `state.activity === "approval-below"`.
