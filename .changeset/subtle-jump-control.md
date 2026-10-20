---
"@runtypelabs/persona": patch
---

Make the V5 jump-to-latest control smaller and less prominent with a 32px neutral surface, semantic text color, and subtle border. Preserve V4 defaults and authored theme overrides in both transcript and event-stream views.

Hide the transcript jump control when the latest content is already readable, excluding anchor spacers and composer padding. Refresh visibility as content and composer layouts settle while preserving the reader's scroll intent.

Position the transcript jump control 16px above visible composer content, adapting to growing input, attachments, and suggestions instead of adding the footer’s transparent top inset to the gap.
