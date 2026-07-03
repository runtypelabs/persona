---
"@runtypelabs/persona": minor
---

Context mentions: finer-grained extension hooks.

- `contextMentions.renderMentionItem` — narrow per-row override that keeps the built-in menu chrome (group headers, loading/empty/error, keyboard nav) while you supply just the row's inner content. The widget retains the `role="option"` wrapper and its click/hover wiring.
- `renderMentionChip` now receives `ctx.payload` — the resolved payload for select-resolved sources — so a custom chip can preview already-fetched content on hover. (Submit-resolved sources like smart-dom resolve at send time; for those, `ref.itemId` carries the source key, e.g. a CSS selector, to re-read on demand.)
- `createSmartDomMentionSource` gains a `mapItem(el, defaultItem)` option to reshape surfaced items without writing a source from scratch. `EnrichedPageElement` is now re-exported from `@runtypelabs/persona/smart-dom-reader`.
