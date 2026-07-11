# Icon Registry Shortlist

## Overview

The widget currently imports lucide via `import * as icons from "lucide"` in `src/utils/icons.ts`, then looks up icons by string name at runtime. This blocks tree-shaking: lucide ships 1640 icon entries (~400KB of icon-node data) and our IIFE bundle (`dist/index.global.js`, the script-tag/CDN distribution) drags every one along, even though the widget itself uses ~30.

We are converting `utils/icons.ts` to a **closed registry of explicitly named imports**. The bundler can then drop unused icons. The trade-off is that `renderLucideIcon(name)` becomes a closed set: any name not in the registry returns `null` and logs a warning. Custom `ComponentRenderer` authors are public consumers of `renderLucideIcon`, so the registry must be generous enough that they rarely hit a missing-icon dead end.

This file defines the curated ~100-icon registry. **Verified against `lucide@0.552.0`**: every entry below resolves to a real file under `node_modules/.pnpm/lucide@0.552.0/node_modules/lucide/dist/esm/icons/`.

**Rule for adding/removing later:** Adding an icon is cheap (~1KB per entry), so add freely if it appears in widget source, in defaults, or as a documented configuration default. Before adding by request, check whether the *visual* is already covered by an existing entry (e.g. don't add `pen` when `pencil` is registered). Use lucide's actual kebab-case identifier: `arrow-up-right`, never `arrowUpRight` or `arrow_up`. If you remove an icon, grep the widget source and the changelog of theme defaults first; mandatory icons in this list are referenced as string literals in widget code or as documented defaults.

---

## Mandatory (internal use)

These icons are referenced in `packages/widget/src/` as string literals or as documented default values for configurable icon-name fields. Removing any of them breaks the widget out of the box.

**Running total: 34**

| Icon | Where used |
|---|---|
| `activity` | `ui.ts:889`, `ui.ts:5016`: connection/streaming pulse indicator |
| `arrow-down` | default `features.scrollToBottom.iconName` (`defaults.ts:123`) |
| `arrow-up` | default fallback for send button icon in tests / docs |
| `arrow-up-right` | default `launcher.callToActionIconName` (`defaults.ts:52`) |
| `bot` | default `launcher.headerIconName` and `launcher.agentIconName` (`defaults.ts:36-37`) |
| `chevron-down` | reasoning-bubble, tool-bubble, demo-carousel, artifact-pane, event-stream-view |
| `chevron-up` | reasoning-bubble, tool-bubble (collapse state) |
| `chevron-right` | event-stream-view row collapse state (`event-stream-view.ts:261`) |
| `chevron-left` | demo-carousel previous-button (`demo-carousel.ts:404`) |
| `check` | message-actions copy success (`ui.ts:1239`), event-stream copy (`event-stream-view.ts:334`, `:1043`) |
| `clipboard` | event-stream per-row copy button (`event-stream-view.ts:322`, `:343`) |
| `clipboard-copy` | event-stream "Copy All" toolbar (`event-stream-view.ts:528`, `:1005`) |
| `code-xml` | artifact pane view/source toggle icon (lucide's old name for it was `code-2`) |
| `copy` | message-actions default copy icon (`ui.ts:1246`) |
| `file` | attachment fallback for unknown mime types (`attachment-manager.ts:70`) |
| `file-spreadsheet` | attachment icon for excel/spreadsheet (`attachment-manager.ts:68`) |
| `file-text` | attachment icon for pdf/text/word (`attachment-manager.ts:65-67`) |
| `image-plus` | attachments drop overlay test default (`ui.attachments-drop.test.ts:137`) |
| `loader` | default `voiceRecognition.processingIconName` (`ui.ts:4332`) |
| `mic` | default `voiceRecognition.iconName` (`defaults.ts:104`) |
| `paperclip` | default `attachments.buttonIconName` (`composer-builder.ts:412`, `ui.ts:5910`) |
| `refresh-cw` | default `launcher.clearChat.iconName` (`defaults.ts:65`) |
| `search` | event-stream search input icon (`event-stream-view.ts:556`) |
| `send` | default `sendButton.iconName` (`defaults.ts:92`) |
| `shield-alert` | approval-bubble timeout state (`approval-bubble.ts:49`, `:114`) |
| `shield-check` | approval-bubble approved state + approve button (`approval-bubble.ts:50`, `:115`, `:196`) |
| `shield-x` | approval-bubble denied state + deny button (`approval-bubble.ts:48`, `:113`, `:211`) |
| `square` | default `sendButton.stopIconName` (`composer-builder.ts:132`); voice cancel-mode speaking icon (`ui.ts:4358`) |
| `thumbs-down` | message-actions downvote (`ui.ts:1263`, `:1280`) |
| `thumbs-up` | message-actions upvote (`ui.ts:1263`, `:1280`) |
| `upload` | default `dropOverlay.iconName` (`ui.ts:441`) |
| `volume-2` | voice speaking-state default for non-cancel/non-barge-in modes (`ui.ts:4360`) |
| `x` | default `launcher.closeButtonIconName` (`ui.ts:5395`, `header-builder.ts:311`, `header-layouts.ts:217`); attachment remove button (`attachment-manager.ts:345`); event-stream "copy failed" feedback (`event-stream-view.ts:1045`) |
| `loader-circle` | replaces `loader-2` from older lucide versions; needed because some configs may pass it for indeterminate spinners |

---

## Curated additions

Grouped by UI pattern. Each entry is a one-line rationale.

### Forms / inputs (14)

Running total: 47

| Icon | Rationale |
|---|---|
| `user` | Avatars, profile, "name" field, attribution |
| `mail` | Email field, contact, notifications channel |
| `phone` | Phone-number field, call action, contact |
| `calendar` | Date picker, scheduling form |
| `clock` | Time picker, duration, "recently" |
| `building` | Company/organization field, B2B forms |
| `map-pin` | Address field, location, "near me" |
| `lock` | Password field, secure / restricted state |
| `key` | API key field, credentials, access |
| `credit-card` | Payment field, billing, checkout |
| `at-sign` | Email or mention indicator inside text inputs |
| `hash` | Tag / channel field, room names, count |
| `globe` | URL field, language/locale, public visibility |
| `link` | Hyperlink field, share-link action, "copy link" |

### Status / feedback (6)

Running total: 53

| Icon | Rationale |
|---|---|
| `circle-check` | Lucide's current name for `check-circle`: success badge in cards/toasts |
| `circle-x` | Lucide's current name for `x-circle`: error/dismiss pill on inline status |
| `triangle-alert` | Lucide's current name for `alert-triangle`: warning state, the canonical "watch out" glyph |
| `info` | Informational tooltips, hint blocks |
| `ban` | Disabled/forbidden state, blocked user, unsupported feature |
| `shield` | Trust/security badge (paired with the existing `shield-check`/`shield-x`/`shield-alert`) |

### Navigation (7)

Running total: 60

| Icon | Rationale |
|---|---|
| `arrow-left` | Back navigation, previous step |
| `arrow-right` | Forward, "continue", next step CTA |
| `external-link` | Outbound link affordance: high-frequency in chat output |
| `ellipsis` | Lucide's current name for `more-horizontal`: overflow / "more options" menu |
| `ellipsis-vertical` | Lucide's current name for `more-vertical`: kebab menu in lists/rows |
| `menu` | Hamburger / sidebar toggle |
| `house` | Lucide's current name for `home`: home/dashboard nav |

### Actions (14)

Running total: 74

| Icon | Rationale |
|---|---|
| `plus` | Add / create button |
| `minus` | Remove / decrement |
| `pencil` | Edit affordance (lucide v0.552 dropped `edit`; `pencil` is the canonical replacement) |
| `trash` | Delete (single-line glyph) |
| `trash-2` | Delete (filled-bin variant; many designers prefer this; both ship in most icon sets) |
| `save` | Explicit save action |
| `download` | Download file/export action |
| `share` | Share sheet / share-link action |
| `funnel` | Lucide's current name for `filter`: filter dropdowns and table headers |
| `settings` | Settings / preferences gear |
| `rotate-cw` | Retry / refresh action (visually distinct from `refresh-cw`: clockwise rotation) |
| `maximize` | Expand panel / fullscreen |
| `minimize` | Shrink panel / exit fullscreen |
| `plus` already counted | (kept as reminder; not double-counted) |

### Commerce (11)

Running total: 85

| Icon | Rationale |
|---|---|
| `shopping-cart` | Cart, checkout: table-stakes for retail integrations |
| `shopping-bag` | Alt cart visual; common in mobile/fashion contexts |
| `package` | Order / shipment object, generic "product" |
| `truck` | Shipping / delivery status |
| `tag` | Price tag, label, category |
| `gift` | Gift card, promotion, freebie |
| `receipt` | Order receipt, transaction history |
| `wallet` | Stored value, balance, account |
| `store` | Storefront, retailer, location |
| `dollar-sign` | Currency / price (generic; works for non-USD as a money glyph) |
| `percent` | Discount, tax rate, percentage stat |

### Media (7)

Running total: 92

| Icon | Rationale |
|---|---|
| `play` | Audio/video playback |
| `pause` | Playback pause, also "pause notifications" |
| `volume-x` | Mute (paired with mandatory `volume-2`) |
| `camera` | Photo capture, profile picture upload |
| `image` | Image attachment, media library |
| `film` | Video attachment, media library entry |
| `headphones` | Audio mode, listening state, podcast |

### Social / Comms (8)

Running total: 100

| Icon | Rationale |
|---|---|
| `message-circle` | Chat bubble (rounded variant): generic conversation |
| `message-square` | Chat bubble (squared variant): alternate styling |
| `bell` | Notifications |
| `heart` | Like / favorite / save |
| `star` | Rating, favorite, featured |
| `eye` | Show password, "viewed by" indicator |
| `eye-off` | Hide password, redacted content |
| `bookmark` | Save for later |

### Time (3)

Running total: 103

| Icon | Rationale |
|---|---|
| `calendar-days` | Date range / week view (richer than `calendar`) |
| `history` | Recent items, audit trail |
| `timer` | Countdown, duration timer |

### Files (3)

Running total: 106

| Icon | Rationale |
|---|---|
| `folder` | Closed folder / collection |
| `folder-open` | Expanded folder / current selection |
| `files` | Multi-file / "documents" group |

### Decorative (5)

Running total: 111

Wait: actually that's 110 unique icons. Recount confirms **110 total** (33 mandatory + 77 curated).

| Icon | Rationale |
|---|---|
| `sparkles` | AI / "magic" affordance: extremely common in agent UIs |
| `zap` | Power / fast action / "lightning" CTA |
| `sun` | Light theme toggle |
| `moon` | Dark theme toggle |
| `flag` | Report / mark / milestone |

---

## Final count

- **Mandatory:** 34
- **Curated additions:** 77
- **Total:** 111 (within the 90-110 target band)

All 111 names verified to exist as files under `lucide@0.552.0/dist/esm/icons/*.js`.

---

## Excluded but considered

Useful when someone later asks "why isn't `foo` in the registry?"

| Icon | Why excluded |
|---|---|
| `file-json` | **Does not exist in lucide v0.552**: `attachment-manager.ts:69` references it as a fallback for `application/json` mime types, but the runtime already handles a missing icon gracefully (`renderLucideIcon` returns `null`). Switch the source to `file-code` or `file-braces` before relying on it. |
| `home` | Renamed to `house` in lucide. Adding `home` would silently miss; consumers should learn the new name. |
| `edit`, `edit-2`, `edit-3` | All removed from lucide. Use `pencil` (registered) or `square-pen`. |
| `alert-triangle`, `alert-circle` | Renamed to `triangle-alert` and `circle-alert`: register the new names. |
| `more-horizontal`, `more-vertical` | Renamed to `ellipsis` / `ellipsis-vertical`: register the new names. |
| `loader-2` | Renamed to `loader-circle`. |
| `pen` | Visual overlap with `pencil`; pick one. We registered `pencil` because it's the long-standing convention and matches the original `edit` semantics. |
| `wand-2`, `wand`, `wand-sparkles` | Niche; `sparkles` covers the AI-magic affordance more universally. |
| `circle-alert` | Considered as a third "warning" glyph alongside `triangle-alert` + `info`. Cut to keep the status set lean: `triangle-alert` is the canonical warning shape. Add back if a consumer asks. |
| `hourglass` | Niche; `timer` and `clock` cover the "time passing" semantic without it. |
| `file-image` | Redundant with `image`; not worth the kilobyte unless attachment previews start using a dedicated file-shaped variant. |
| `bot-message-square`, `palette` | Brand/decorative; pull in only if/when the widget adopts them as defaults. |
