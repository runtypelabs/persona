---
"@runtypelabs/persona": minor
---

Inline artifact blocks now render file-preview chrome. Every `display: "inline"` artifact gets a title bar with copy and expand controls wrapping the preview body, so an inline block reads like a document instead of a bare body in a bordered box. The chrome is themeable via `theme.components.artifact.inline` (frame background, border, radius, chrome background/border, title and muted colors, frame height), and hosts can add custom buttons through `features.artifacts.inlineActions` (same shape as `cardActions`). Expand opens the artifact fullscreen in the pane (the expanded state, chat column hidden) and fires `onArtifactAction({ type: "open" })` so hosts can intercept. The inline block already shows the full preview at chat width, so the split view would only duplicate it; Close returns to the chat, and the pane's expand toggle (when enabled) collapses to split view.

This is a visible change for existing `display: "inline"` hosts on upgrade: the title bar and buttons appear automatically. Set `features.artifacts.inlineChrome: false` to opt out and keep the bare inline body, or pass `{ showCopy, showExpand }` to toggle individual controls.

The artifact pane copy button now copies the raw file source for file artifacts instead of the fenced code-block markdown, matching the new inline copy button (both share the same copy-payload helper).

The pane's default toolbar preset can now show that copy button too: set `features.artifacts.layout.showCopyButton: true` (off by default; the document preset always shows it).

The pane's default toolbar Close control is now an icon button (x) to match the other toolbar controls.

The pane's view/source toggle is now a segmented pill in both toolbar presets: one bordered container with borderless segments and a highlighted active segment, instead of two separated buttons. New `theme.components.artifact.toolbar` tokens (`toggleGroupPadding`, `toggleGroupBorder`, `toggleGroupBorderRadius`, `toggleGroupBackground`) style the container, and the existing `documentToolbarToggleActiveBackground` / `documentToolbarToggleActiveBorderColor` layout options still style the active segment. The active highlight slides between segments when the selection changes (CSS only, honors `prefers-reduced-motion`, falls back to a static highlight in browsers without `:has()`).
