---
"@runtypelabs/persona": minor
---

Route nested-flow SSE events (`step_delta` with `toolContext`) into separate assistant bubbles, respect `partId` segmentation for nested prompts, and ignore nested `text_start` / `text_end` on the outer stream. Add optional `parentToolId` and `parentStepId` on message metadata for grouping nested output.

Improve header close-button visibility and alignment: default `launcher.closeButtonPaddingX` / `closeButtonPaddingY` to `0px`, render the close icon larger to match other header actions, and use consistent flex centering with the clear-chat control.
