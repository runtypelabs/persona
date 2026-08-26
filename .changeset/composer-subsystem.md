---
"@runtypelabs/persona": minor
---

The composer is now a stateful, extensible subsystem: one public state view, one submission pipeline, one action registry, and declarative configuration for the controls flagship products ship. Everything below is additive; defaults are unchanged.

State and submission:

- `controller.getComposerState()` returns a frozen `ComposerState` (text, attachments, mention refs, model and mode selection, quote, pending submission, phase, locks), mirrored by a coalesced `persona:composer:state` DOM event. Mention refs sync the moment a mention is committed, including mouse selection.
- `composer.onBeforeSend(snapshot, { signal })` intercepts every send: return `false` to cancel, or a `{ text, options }` patch to rewrite the outgoing snapshot without touching the visible draft. Cancel, throw, or abort always leaves the draft, attachments, and chips intact.
- Every submission path builds one immutable snapshot in a documented order (draft, inline slash command, attachment readiness, `onBeforeSend`, mention resolution, dispatch). Wire payloads and the content priority chain are unchanged.

Actions:

- `composer.actions` and the new `contributeComposerActions` plugin hook feed one registry alongside the built-ins. Every plugin's hook runs, ids are namespaced per plugin, duplicates resolve to the first contributor, and documented order ranges (mentions 100, attachment 200, custom 500, mic 800, send 1000, send terminal) place controls deterministically in both the full and pill composers.
- `visible`, `disabled`, and `pressed` re-evaluate on state changes and `controller.update()`; async `onSelect` gets a busy state; custom actions own their element and cleanup.
- `composer.actionOverflow` presents the registry in an accessible `+` menu (`role="menu"`, roving focus, Escape and outside dismissal, Shadow DOM safe). `presentation: "bar" | "overflow" | "auto"` places each action, `collapseAutoActionsBelow` folds `auto` actions by measured footer width, and built-ins fold only when named in `includeBuiltIns`. Folded built-ins render as real labeled menu rows: bar chrome and tooltips are suppressed, activation closes the menu, and rows shade on hover and keyboard focus only.

Baseline configuration:

- `composer.submitKey` (`"enter"` default, `"mod-enter"`, `"none"`) plus `composer.insertNewlineOnTouchEnter` for coarse pointers; `enterKeyHint` derives from the effective mode. Mention and slash menus keep first refusal and IME stays protected under every mode.
- `composer.maxLines` caps growth for the textarea, the pill, and the inline mention editor. `composer.inputAttributes` allowlists `autocomplete`, `autocapitalize`, `spellcheck`, `inputmode`, and `ariaLabel`.
- `composer.inputDisabled` locks composition entirely; `composer.sendDisabled` keeps composition and blocks every submission path. Both take `{ reason }`, announced politely in the status region. Streaming sets neither and Stop keeps working.
- `attachments.onChange` reports the public `ComposerAttachmentState[]`; `attachments.adapter` (`add(file, { signal, onProgress })`, optional `remove`) enables eager upload with progress, retry, abort on remove and clear and destroy, and send gating until every attachment is ready. Base64 stays the default adapter.

Models and modes:

- `composer.models` renders a built-in picker in the end cluster (token-height pill, themed chevron, RTL aware). Selection lives in composer state and never mutates `config.agent`; `composer.onModelChange` observes it.
- `composer.modes` and `composer.modeGroups` add toggleable modes with single or multiple selection, `once` or `sticky` persistence, removable header chips, and per-mode placeholder overrides. Mode and mention chips share one wrapping header rail, modes first.
- Each send ships the selection as an optional top-level `composerOptions` on the request, visible to `requestMiddleware` and `customFetch`. An inline client agent maps an allowed model onto that turn only; server-pinned routes are governed by the proxy.
- `voiceRecognition.completionBehavior: "review"` leaves the dictation transcript in the composer instead of auto-sending (default stays `"send"`).

Sizing and chrome:

- `theme.components.composer.controlSize` (default 40px) and `controlIconSize` (24px) size every bar control from one token, live-updatable, with per-control config keys (`sendButton.size`, `voiceRecognition.iconSize` and padding) as explicit overrides and a 40px hit-area floor on coarse pointers. Notable consequences: those per-control keys no longer carry defaults in `DEFAULT_WIDGET_CONFIG`, the attachment and mention buttons no longer inherit from `sendButton.size`, the mic is a true 40px box, and an unrelated `update()` no longer resizes the send glyph.
- The footer carries `data-persona-composer-compact` while the composer is idle; core CSS attaches no layout to it.
- `ComposerMode`, `ComposerModeGroup`, and `ComposerActionOverflowConfig` are exported from the package entry, and the `quote` icon is registered.
