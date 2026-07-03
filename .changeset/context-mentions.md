---
"@runtypelabs/persona": minor
---

Add context mentions to the composer. Users can pull external context into a turn by typing `@` or clicking a visible context button — both open one shared, searchable menu of host-provided sources. Selecting a mention strips the typed query and adds a removable pill chip; the resolved content reaches the model via `llmAppend`/`contentParts` (default, no backend changes) or an opt-in structured `context.mentions` channel.

- New config: `contextMentions` (`enabled`, `sources`, `showButton`, `trigger`, `maxMentions`, `maxItemsPerGroup`, `searchDebounceMs`, `renderMentionMenu`/`renderMentionChip` overrides, `onMentionRejected`/`onMentionResolveError`).
- New exported helpers for building sources: `defaultMentionFilter` and `createStaticMentionSource`.
- Resolve-on-select by default (cached, abortable) so submit stays instant; per-source `resolveOn: "submit"` for time-sensitive sources.
- Keyboard accessible (↑/↓ navigate, Enter/Tab select, Esc keeps a literal `@`, Backspace removes the last chip), with a polite live region and listbox semantics.
- Disabled by default. When enabled, the mention runtime is lazy-loaded from a sibling `context-mentions.js` chunk on first use, so sites that leave it off pay no core-bundle cost.
