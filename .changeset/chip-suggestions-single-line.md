---
"@runtypelabs/persona": patch
---

Chip suggestions are now single-line. The `chip` variant ignores an item's `description` and renders the label alone, matching the chip pattern used across ChatGPT, Gemini, and Google's chip guidance. Use the `list` or `card` variant when items need supporting copy. Composer-placed chip rows also center as a block within the content column: a single row sits centered while wrapped rows keep a shared left edge, and transcript follow-ups and welcome rows stay left-aligned.

Follow-up suggestions now wrap by default instead of horizontally scrolling: two to four compact chips always fit at widget width, while a scroll strip hid most of the set behind a fade. Pass `suggestions.followUps.overflow: "scroll"` to opt back into the strip for large sets. Follow-ups also keep a 12px gap from the answer they belong to when the welcome card is hidden; the pull-up written for the roomier welcome-visible spacing had been collapsing that gap to zero.

Card and list alignment now follows content: items with a description top-align their icon and arrow so multi-line copy reads correctly in equal-height grid rows, while label-only items center vertically instead of leaving dead space inside the card min-height.
