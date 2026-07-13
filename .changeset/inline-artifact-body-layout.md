---
"@runtypelabs/persona": minor
---

Add `features.artifacts.inlineBody` to control how the inline artifact block (`display: "inline"`) reserves height and behaves while a file/document artifact streams. Instead of growing an unbounded `<pre>` during streaming and then snapping to the completed preview, the streaming source now renders into a reserved fixed-height window with internal tail-follow scroll, so the streaming→complete swap is layout-neutral.

Options: `streamingView` (`"source"` | `"status"`), `height` (a number of px, `"auto"`, or per-state `{ streaming, complete }`), `followOutput`, `fadeMask`, and `transition`. A numeric height reserves the whole body region (border-box, padding included) via the `--persona-artifact-inline-body-height` CSS var; the older `--persona-artifact-inline-frame-height` var still overrides the iframe height when the new one is unset.

Inline code bodies (streaming source and `viewMode: "source"`) are now full-bleed like the pane's source view: the line-number gutter sits flush against the frame edge, with no body padding. Iframe previews, rendered markdown, and the status placeholder keep the padded treatment.

Behavior change: the new default (a fixed 320px streaming source window with tail-follow, a top edge fade, and an animated streaming→complete swap) replaces the previous grow-with-content streaming behavior for inline blocks. Set `inlineBody: { height: "auto" }` to restore the old content-sized streaming behavior. This affects only the inline block; the artifact pane is unchanged.
