---
"@runtypelabs/persona": patch
---

Route nested-flow `step_delta` events (with `toolContext`) into separate assistant bubbles, respect `partId` segmentation for nested prompts, and ignore nested `text_start` / `text_end` for the outer assistant stream. Add optional `parentToolId` and `parentStepId` on message metadata for grouping nested output.
