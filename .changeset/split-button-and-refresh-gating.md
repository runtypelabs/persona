---
"@runtypelabs/persona": minor
---

Add a `createSplitButton` helper (exported alongside the other button builders): one bordered control holding a primary action button and an icon-only chevron that opens a dropdown menu, divided by an internal hairline, with two tab stops and an `aria-expanded` state that stays accurate across outside-click dismissal (`createDropdownMenu` gained an `onOpenChange` callback for this). The artifact pane's document-toolbar copy menu now renders on this anatomy instead of a detached chevron beside the Copy pill. The document toolbar's refresh button now renders only while `onDocumentToolbarRefresh` is set, since the glyph reads "reload this preview"; a live config update can still reveal or remove it.
