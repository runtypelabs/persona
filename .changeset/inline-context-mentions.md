---
"@runtypelabs/persona": minor
---

Add inline context mentions (`contextMentions.display: "inline"`). Selecting an
`@` mention can now insert a Slack/Linear/Cursor-style atomic token that stays in
the sentence, backed by a contenteditable composer, instead of the default chip
row. The resolved-context channel (`llmContent`/`contentParts`) is unchanged,
since inline tokens are a display concern. Opt in per widget; the default stays
`"chip"`.

The contenteditable engine ships as a separate lazy chunk
(`context-mentions-inline.js`, ~3 kB gz) loaded on composer mount only when
`display: "inline"`, so chip-only and feature-off embeds are unaffected. Sent
inline messages carry ordered `contentSegments`, so the sent bubble re-renders
each `@token` in place instead of showing the mention twice (raw prose plus a
chip row). Composer-history recall of an inline message currently restores plain
text; live token recall is a known follow-up.

In inline mode the mention menu now anchors horizontally to the `@` trigger glyph
(Slack-style), measured once per trigger session and clamped so a near-right
trigger shifts the menu left to stay within the composer, and it follows the
composer as it auto-grows on line-wrap (a `ResizeObserver` re-measures the anchor
and repositions while the menu is open); chip mode keeps the composer-anchored
menu.

This release also hardens context-mention accessibility: mention tokens announce
as one unit and speak resolve failures, the menu listbox exposes proper group,
presentation, and setsize/posinset semantics, the affordance button and picker
search field reflect their open state, and resolve failures are announced through
a dedicated assertive live region that is hosted in the light DOM under
`useShadowDom`.
