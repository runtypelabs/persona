# Scoped style migrations

Persona 4.x supports component theme styling alongside legacy configuration. Both values of `future.v5Defaults` preserve existing unconfigured appearances. This guide describes supported replacements; it does not schedule a removal or move behavior into the theme.

For each migrated property, precedence is **explicit legacy override → explicit component theme value (including the active dark override) → shared component/semantic/default fallback**. Defaults added by Persona do not count as a host override. Existing welcome aliases retain their different precedence: `welcome.*` wins over `copy.welcome*`.

An omitted update key retains its value and origin. An own `undefined` removes that override; resetting a parent removes its tracked descendants. To migrate an already mounted widget, set the theme and clear the old property in the same update:

```ts
widget.update({
  launcher: { closeButtonColor: undefined },
  theme: { components: { header: { close: { foreground: '#b91c1c' } } } },
});
```

Persona's own merge helpers and supported config copies preserve origin. Externally default-filled or JSON-round-tripped config has unknowable origin: present legacy values conservatively remain explicit. Remove those fields, or reset them with own `undefined`, to let component styling take over. Comparing values with defaults cannot determine intent.

## Close, clear, submit, and mic

All paths in this guide are relative to `theme.components`; the same paths work in `darkTheme.components`. Each independent control accepts `size`, `iconSize`, `iconStrokeWidth`, `background`, `foreground`, `borderColor`, `borderWidth`, `borderRadius`, and `padding`. Lengths and padding use CSS units; stroke width is unitless. Border color alone does not introduce a visible border.

| Legacy property | Component theme replacement | Qualification |
| --- | --- | --- |
| `launcher.closeButtonSize/Color/BackgroundColor/BorderWidth/BorderColor/BorderRadius` | `header.close.size/foreground/background/borderWidth/borderColor/borderRadius` | Close only; composer-bar mode retains its deliberately smaller box/glyph. |
| `launcher.closeButtonPaddingX/Y` | `header.close.padding` | Combine as CSS `Y X`; explicit legacy axes still override only their axis. |
| `launcher.clearChat.size/iconColor/backgroundColor/borderWidth/borderColor/borderRadius/paddingX/paddingY` | Matching leaves in `header.clear` | Clear only; Messages and trailing actions retain shared header tokens. |
| `sendButton.size/iconSize/iconStrokeWidth/backgroundColor/textColor/borderWidth/borderColor` | `composer.send.size/iconSize/iconStrokeWidth/background/foreground/borderWidth/borderColor` | Box size and legacy background apply to icon mode. Theme background can intentionally style text mode. |
| `sendButton.paddingX/Y` | `composer.send.padding` | The old fields style text mode only and remain ignored in icon mode. Theme padding can intentionally style either mode. |
| Shared `composer.sendButtonRadius` | `composer.send.borderRadius` for an independent override | The older shared token remains a fallback; there is no legacy `sendButton.borderRadius` config field. |
| `voiceRecognition.iconSize` | **Both** `voice.control.size` and `.iconSize` | Legacy size supplies both nominal box and glyph size. It does not separate them. |
| `voiceRecognition.iconColor/backgroundColor/borderWidth/borderColor/paddingX/paddingY` | `voice.control.foreground/background/borderWidth/borderColor/padding` | Idle mic only. |

A nominal glyph may shrink inside the box because of inherited browser padding. Exact mic migration sets both box and glyph to the old nominal size and preserves padding; setting `padding: '0'` intentionally gives the glyph the full box. Theme sizes retain the coarse-pointer hit-area floor; an explicit legacy size retains its existing exact-size precedence. Built-in SVGs inherit `currentColor`, so state colors reach their strokes. Icon names, custom icon registration/rendering, tooltips, accessible labels, and use-icon behavior remain configuration.

`composer.sendIconSize`, `composer.sendButtonRadius`, shared header/composer control sizing, and semantic colors remain fallbacks beneath independent controls. Stop state continues to use `button.stop.*`; explicit legacy send colors keep their precedence. An explicit legacy send color also supplies an idle mic fallback. A theme-only parity migration sets the matching `voice.control` color too; independently styled send and mic controls are an intentional new capability.

```ts
const theme = {
  components: {
    header: {
      close: { size: '32px', foreground: '#b91c1c' },
      clear: { size: '36px', foreground: '#1d4ed8' },
    },
    composer: { send: { size: '40px', iconSize: '20px', background: '#111827', foreground: '#ffffff' } },
    voice: { control: { size: '28px', iconSize: '28px', background: '#111827', foreground: '#ffffff' } },
  },
};
```

## Voice states

| Legacy state colors | Component theme replacement |
| --- | --- |
| `recordingIconColor/recordingBackgroundColor/recordingBorderColor` | `voice.recording.indicator/background/border` |
| `processingIconColor/processingBackgroundColor/processingBorderColor` | `voice.processing.icon/background/border` |
| `speakingIconColor/speakingBackgroundColor/speakingBorderColor` | `voice.speaking.icon/background/border` |

Existing `voice.recording.border`, `voice.processing.icon/background`, and `voice.speaking.icon` were emitted but ineffective. They now work when explicitly supplied by the host; their materialized defaults do not recolor ordinary widgets. New processing border and speaking background/border are optional. Recording indicator/background retain their existing consumption. A color does not add border width. Browser dictation and hosted/custom providers share the style recipe, preserve state/labels while themes update, and restore idle styling from current config. Barge-in retains its historical hot-mic fallback and interruption behavior. Provider setup, state icon identity, animation eligibility, and voice policy stay in voice config.

## Tool cards and activity rows

| `toolCall` property | `toolBubble` token |
| --- | --- |
| `shadow/backgroundColor/borderColor/borderWidth/borderRadius` | `shadow/background/borderColor/borderWidth/borderRadius` |
| `headerBackgroundColor/headerTextColor/headerPaddingX/headerPaddingY` | `header.background/foreground/padding` |
| `contentBackgroundColor/contentTextColor/contentPaddingX/contentPaddingY` | `content.background/foreground/padding` |
| `codeBlockBackgroundColor/codeBlockTextColor/codeBlockBorderColor` | `codeBlock.background/foreground/borderColor` |
| `toggleTextColor/labelTextColor` | `toggleForeground/labelForeground` |
| `loadingAnimationColor/loadingAnimationSecondaryColor/loadingAnimationDuration` | `loading.primary/secondary/duration` |

Convert legacy numeric milliseconds explicitly: `1600` becomes `'1600ms'`. Header/body padding combines as CSS `Y X`; one explicit legacy axis overrides only that axis. Specific content padding falls through to existing activity/tool body-padding fallbacks. Card and row variants keep distinct absent-value geometry; neither global Markdown code colors nor collapsible colors substitute for tool-only styling. Loading animation choice, expansion/grouping, text templates, and render hooks remain config.

## Approval and question surfaces

| `approval` property | Theme token |
| --- | --- |
| `backgroundColor/borderColor/shadow` | `approval.requested.background/border/shadow` |
| `titleColor/descriptionColor/reasonColor` | Same leaves under `approval.requested` |
| `parameterBackgroundColor/parameterTextColor` | `approval.requested.parameters.background/foreground` |
| `approveButtonColor/approveButtonTextColor` | `approval.approve.background/foreground` |
| `denyButtonColor/denyButtonTextColor` | `approval.deny.background/foreground` |

For exact migration of a legacy `descriptionColor` that also colors the public builder’s reason, set both `requested.descriptionColor` and `requested.reasonColor`. These new leaves intentionally style separate text roles.

Explicit requested text and approve/deny foreground values now work; inherited defaults do not recolor existing cards. Specific text colors fall through explicit `requested.text` and then each element's old fallback. The built-in plugin and public `createApprovalBubble` share style mapping while preserving their separate integration contracts and absent-value deny colors. Labels, keyboard shortcuts, callbacks, remembered permissions, details display, and custom renderers stay supported.

The nine `features.askUserQuestion.styles` replacements are:

| Local style | `askUserQuestion` token |
| --- | --- |
| `sheetBackground/sheetBorder/sheetShadow` | `sheet.background/border/shadow` |
| `pillBackground/pillTextColor/pillBorderRadius` | `pill.background/foreground/borderRadius` |
| `pillBackgroundSelected/pillTextColorSelected` | `pill.selectedBackground/selectedForeground` |
| `customInputBackground` | `customInput.background` |

Local feature styles remain highest priority. Layout, grouped navigation, labels, exposure/enabled flags, and slide timing remain feature configuration.

## Artifact chrome

| `features.artifacts.layout` property | `artifact` token |
| --- | --- |
| `paneBackground/panePadding/paneBorderRadius/paneShadow/paneBorder/paneBorderLeft` | `pane.background/padding/borderRadius/shadow/border/borderLeft` |
| `chatShadow` | `chat.shadow` |
| `unifiedSplitOuterRadius` | `split.outerRadius` |
| `documentToolbarIconColor` | `toolbar.iconColor` |
| `documentToolbarToggleActiveBackground/BorderColor/Color` | `toolbar.toggleActiveBackground/toggleActiveBorderColor/toggleActiveColor` |
| `tabFadeSize` | `tab.fadeSize` |

`border` and `borderLeft` are full CSS shorthands; a full border wins over the left-only border. Detached/welded/drawer behavior, pane geometry, resizing, `chatSurface`, toolbar preset choice, and fade enablement stay in layout config. Resetting an override exposes the current theme without deleting theme-owned variables. Artifact code remains lazy loaded.

## Suggestions and retained capabilities

Use `suggestion.chip.fontWeight` and `.padding` for chip typography/padding. Explicit old weight/axes still win; inherited `500`/`6px 12px` no longer defeat the theme. Clearing an axis exposes theme padding for that axis. Card/list variants retain their own styles. Move starter items to `suggestions.starters.items` and explicitly choose `variant: 'chip', placement: 'composer', overflow: 'wrap'` to preserve the legacy chip placement. `welcome.title/subtitle/variant` replace old welcome copy fields; choose `variant: 'none'` to hide it. Existing new welcome values win over old copy aliases.

Accepted no-ops remain no-ops: `suggestionChipsConfig.fontFamily`, `unifiedSplitChrome`, and unsupported `messages`/`composer` layout slots. No parity mapping is claimed for them. Widget presets, exported approval builders, callbacks, custom renderers/icons, labels/accessibility, provider settings, and behavior remain supported. Markdown uses `--persona-md-*`; the three compatibility collapsible aliases `--cw-container`, `--cw-surface`, and `--cw-border` remain emitted.

Debug migration hints appear only with `debug: true`, once per widget/path. Persona defaults do not warn. Enabling debug later diagnoses currently active aliases; resets do not warn. A closed deferred installer waits until its full widget opens before diagnosing, preserving its tiny launcher path. These hints cover verified mappings and retain compatibility throughout 4.x.

The theme editor separates shape controls from light/dark color controls, writes modern welcome/starter/component paths, and exports their serializable values. Function-valued hooks/custom renderers are supported at runtime but must be reattached in application code rather than represented as JSON. See [THEME-CONFIG.md](../packages/widget/THEME-CONFIG.md) for the full token reference and the local [style comparison demo](../apps/web/style-migration.html) for baseline/legacy/theme samples.
