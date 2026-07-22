---
"@runtypelabs/persona": minor
---

Add inline context mentions (`contextMentions.display: "inline"`). Selecting an `@` mention inserts a Slack/Linear/Cursor-style atomic token that stays in the sentence, backed by a contenteditable composer, instead of the default chip row. The resolved-context channel is identical in both modes; inline is a display concern. Opt in per widget; the default stays `"chip"`.

- The contenteditable engine ships as a separate lazy chunk (`context-mentions-inline.js`, ~3 kB gz) loaded on composer mount only when `display: "inline"`, so chip-only and feature-off embeds are unaffected.
- The same item can be mentioned more than once in a message: each pick inserts its own token, and the submit bundle dedupes the resolved payload by (source, item) so the model receives the context once. Chip mode still rejects duplicates, since its context row is an attachment list.
- Sent messages carry ordered `contentSegments`, so the sent bubble re-renders each `@token` in place rather than showing prose plus a chip row. Composer-history recall of an inline message restores plain text; live token recall is a known follow-up.
- The mention menu anchors to the `@` trigger glyph (Slack-style) rather than the composer: horizontally clamped so a near-right trigger shifts the menu left to stay within the composer, vertically anchored to the trigger's line, and re-positioned as the composer auto-grows on line wrap. Chip mode keeps the composer-anchored menu.
- Tokens render via `renderMentionToken` (in both the composer and the sent bubble); `renderMentionChip` is ignored for `@` mentions in this mode. Tokens announce as one unit to screen readers and speak resolve failures through a dedicated assertive live region (hosted in the light DOM under `useShadowDom`).
