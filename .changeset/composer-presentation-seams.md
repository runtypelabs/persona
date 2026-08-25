---
"@runtypelabs/persona": minor
---

Composer, welcome, bubble, and reasoning presentation seams that replace page-level CSS hacks, plus a custom model picker popover and two markdown-pipeline fixes. Defaults are unchanged.

Composer:

- `composer.layout: "stacked" | "single-row"` (default `"stacked"`) lays the idle composer out as one pill: the start cluster leads the editor, the end cluster trails it, and the editor absorbs the remaining width. Stamps `data-persona-composer-layout="single-row"` on the footer only when configured, and the core rules are gated on the existing `data-persona-composer-compact` state, so multi-line drafts, chips, attachment previews, quotes, and pending cards fall back to the stacked card. Ignored in composer-bar mount mode.
- `sendButton.visibility: "always" | "when-text"` hides the send control while the draft is empty and nothing is streaming. The hidden state is `data-persona-send-hidden` on `.persona-send-button-wrapper`.
- `composer.defaultActiveModeIds` selects modes at first mount. A restored draft's `activeModeIds` still wins.
- `composer.actionOverflow.order` moves the `+` trigger off its fixed 900 anchor, so `order: 0` leads the action row.
- `ComposerAction.iconColor` and `.backgroundColor` style a bar button directly.
- `components.button.stop.background` / `.foreground` restyle the send button while it shows Stop. The button now carries `data-persona-send-mode="send" | "stop"`.
- `ComposerModeGroup.presentation: "buttons" | "segmented"` (default `"buttons"`) draws a mode group as one rounded track with its modes as segments and the active one painted as a raised pill. Segments are real buttons with `aria-pressed`; the optional `ComposerModeGroup.label` names the track as a `role="group"`. A segmented group renders no header chips (the track shows the state) and never folds into the overflow menu. New optional tokens under `components.composer.segmented`: `trackBackground`, `trackBorderRadius`, `padding`, `activeBackground`, `activeForeground`, `activeShadow`, `inactiveForeground`, `itemPadding`.
- `composer.modelPicker.presentation: "popover"` swaps the native `<select>` for a button that opens a `role="listbox"` panel, so each `composer.models` entry can carry an optional `icon` (registry glyph) and `description` (muted second line). The trigger keeps the select's class and box, so a themed page does not shift. `composer.modelPicker.suffix` renders muted after the selected label on the closed control; it is drawn by the popover presentation only, since a native `<select>` renders its option text and nothing else. Keyboard and ARIA follow the overflow menu: `aria-haspopup="listbox"` plus `aria-expanded` on the trigger, `role="option"` and `aria-selected` on the rows, arrow keys and Home/End to move, Enter or Space to select, Escape or Tab to close with focus restored to the trigger. Pages can key on `data-persona-composer-model-picker="popover"` and `data-persona-model-option="<id>"`. Like a segmented mode track, the popover trigger always renders in the action row and never folds into the overflow menu; the native select still folds as before. New optional tokens under `components.composer.modelPicker`: `menuBackground`, `menuBorderRadius`, `rowHoverBackground`, `labelColor`, `descriptionColor`, `suffixColor`. They read as full-path variables with no short alias, keeping the critical launcher bundle out of it.

Messages, reasoning, and welcome:

- `components.message.user` / `.assistant` take `padding`, `maxWidth`, `fontSize`, `fontFamily`, and `lineHeight`. Every key is unset by default and falls back to the layout preset's value.
- `messageActions.custom: [{ id, label, iconName, roles, onSelect }]` appends host-contributed buttons to the message actions row, after the built-ins, as `data-action="custom:<id>"`. Assistant-only by default; listing `"user"` brings up the user actions row on its own. Activation is delegated and resolves `onSelect` off live config, so it survives transcript morphs and follows `controller.update()`.
- `features.reasoningDisplay.iconName` renders a leading glyph in the collapsed reasoning header.
- `features.reasoningDisplay.completedVisibility: "kept" | "removed"` drops the whole transcript row for a finished reasoning trace, closing the gap with it.
- Welcome presentation: `welcome.kicker` renders a small muted line above the title (typography via the new `components.introCard.kicker` text tokens), `welcome.align: "start" | "center"` overrides the variant's alignment, and `welcome.icon.placement: "inline"` leads the title with the icon on one row instead of stacking it. All three stamp nothing when unset. New hooks: `.persona-welcome-kicker`, `.persona-welcome-title-row`, `.persona-welcome-head-text`, `data-persona-welcome-align`, `data-persona-welcome-icon-placement`, and the `--persona-welcome-inline-icon-size` / `--persona-welcome-inline-icon-gap` variables.
- `welcome.composerGap` now applies under `composer.placement: "block"` as well, and the resolved anchor is mirrored on the root as `data-persona-welcome-anchor`.

Fixes:

- Custom `markdown.renderer` overrides were handed the bundled parser's positional arguments instead of the token objects the public types document, so every documented field arrived `undefined`. Each override is now adapted to the documented token shape. `table` and `list` additionally carry the parser's rendered children as `headerHtml` / `bodyHtml` / `itemsHtml`, since their structured fields are not reconstructable.
- A throwing custom renderer or `postprocessMessage` propagated out of the bubble builder and silently aborted the whole streaming turn. The message now falls back to escaped plain text and logs one error, and the stream continues.
- The composer action-row placement pass re-inserted every managed element on each sync, which detached and blurred whatever was focused inside one. It now skips elements already in position.

Size budgets bumped for the added CSS and runtime: `index.global.js` 184 kB, `index.js` 196.25 kB, `index.cjs` 197.25 kB, `theme-editor-preview.js` 162.75 kB, `widget.css` 21.5 kB, `launcher.global.js` 16.5 kB, `artifacts-ui.js` 21.75 kB (all gzip). `components.composer.segmented` and `components.composer.modelPicker` deliberately get no short token aliases, so the launcher's theme system stays out of those rows and their CSS reads the auto-emitted full-path variables.
