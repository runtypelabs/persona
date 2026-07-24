# @runtypelabs/persona

## 4.10.1

### Patch Changes

- a8b74da: Fix parent-level artifact overflow in embedded and docked layouts. The injected host is a filling flex surface when the launcher is disabled or docked, but it kept its default `min-width: auto` (content-based) floor, so opening a wide artifact split could grow the host past a shrinkable mount and push content outside the viewport. The host and mount now carry a `min-width: 0` baseline wherever Persona fills its container; emerge dock mode still pins the host to its intentional fixed width. Floating launcher sizing is unchanged.
- c962488: Sync the generated Runtype OpenAPI contract with the unified-only stream spec. The Runtype API removed the legacy `FlowSSEEvent` component (its `step_complete` variant now lives on the unified `ExecutionStreamEvent`), which was breaking the `check:runtype-types` gate. `RuntypeStepCompleteEvent` is now derived from `RuntypeExecutionStreamEvent` with an unchanged shape, and `RuntypeFlowSSEEvent` stays exported as a `@deprecated` alias of `RuntypeExecutionStreamEvent` so existing imports keep working. Prefer `RuntypeExecutionStreamEvent` going forward.

## 4.10.0

### Minor Changes

- 77c2635: update() now applies one consistent recursive patch policy across the live controller and the init handle. A key merges recursively only when both the previous value and the patch value are plain objects; otherwise the patch value replaces (arrays, functions, class instances, and boolean/string vs object unions all replace wholesale). A small replace-leaf list also replaces wholesale to avoid corrupt hybrids or stranded keys: headers, agent, storageAdapter, components, targetProviders, voiceRecognition.provider.custom, and features.streamAnimation.plugins. A key passed explicitly with value undefined clears the previous value and resets to its default (or stays unset when no default exists); an omitted key is preserved.

  The merge is exposed as a new AgentWidgetConfigPatch type accepted by update() (a loosening from the full config type, so existing calls keep working). This also fixes the init handle passing the raw patch to the controller (a double-merge) and an inconsistent tool-call diff baseline.

  Compatibility note: consumers who relied on omitting a nested field to erase sibling values will now see those values preserved. To disable or reset a nested field, set it explicitly (for example to false or to undefined) rather than omitting it.

### Patch Changes

- 26d2bf0: Fix the attachment button ignoring live `update()` changes: `buttonIconName` and `buttonTooltipText` were rendered once when the button was created and never re-applied, so updating them at runtime had no effect until a re-mount. The icon, tooltip, and aria-label are now re-rendered from the merged config on every update.
- af2e99e: Fix three more cases where any live `update()` visibly restyled composer and header chrome: the mic icon boldened (updater rendered stroke 2 while the builder uses 1.5), the mic button color flipped from the text token to `currentColor` (updater had an extra fallback the builder does not), and the close and clear-chat icons lost the builder's `display:block`, shifting them off-center. The update path now mirrors the mount-time builders exactly.
- a685fbd: Contain component artifacts to the pane width and reset stale horizontal scroll when selecting or expanding artifacts.
- 26d2bf0: Fix the attachment drop overlay ignoring live `update()` changes: the overlay was built once at mount and never rebuilt, so `attachments.dropOverlay` values (background, icon, label, border, blur, inset) applied through `update()` had no effect until a re-mount. The overlay is now rebuilt from the merged config on every update.
- e1391f0: Fix two header regressions triggered by any live `update()` call: the close button was revealed on non-closeable panels (an unset `layout.header.showCloseButton` was treated as "show" instead of deferring to panel toggleability), and the clear-chat icon boldened because the update path re-rendered it with stroke width 2 while the mount-time builder uses 1.
- 1299c07: Fix the send button reverting from the stop icon to the send icon when a live `update()` lands during an active stream. The button showed the send arrow mid-stream while its aria-label still read "stop"; the icon content is now left untouched while streaming, so the stop glyph set by the composer survives an update and heals to the send icon on completion.

## 4.9.0

### Minor Changes

- 7dbd517: Composer icon buttons are now themeable and consistent. The attachment (`📎`) button previously carried hardcoded inline styles (transparent background, `--persona-primary` icon color, fixed radius, JS hover) and exposed no color/background config. It and the new "add context" mention button now render from a shared CSS rule wired to the `components.button.ghost.*` token family:

  - New convenience CSS variables `--persona-button-ghost-bg` / `-fg` / `-radius` / `-hover-bg`, driven by `components.button.ghost.{background,foreground,borderRadius,hoverBackground}`. A new `hoverBackground` field was added to `ComponentTokenSet`.
  - Both buttons are restyleable together via `theme.components.button.ghost.*` (or CSS on `.persona-attachment-button` / `.persona-mention-button`) without overriding `--persona-primary` globally. Icon and tooltip text remain per-feature config.
  - The runtime attachment button (created when `attachments` is toggled on after mount) uses the same shared CSS rule, so it restyles identically to the built-in one.

  Layout: both buttons sit in the composer's **left** action cluster, keeping the secondary-left / primary-right convention used across chat UIs and staying clear of mic + send. Applies to both the full (`buildComposer`) and pill (`buildPillComposer`) layouts.

  Visual note: the icon foreground now resolves from `components.button.ghost.foreground` (default `semantic.colors.text`) instead of `--persona-primary`. In the default theme this is imperceptible (both are near-black); in brand-colored themes these secondary icon buttons now render with the neutral text color, aligning them with the voice/mic button rather than tinting them the brand primary.

- 1385d77: Add context mentions to the composer. Users can pull external context into a turn by typing `@` or clicking a visible "add context" button (default icon `+`; both open one shared, searchable menu of host-provided sources). Selecting a mention strips the typed query and adds a removable pill chip; the resolved content reaches the model via `llmAppend`/`contentParts` (default, no backend changes) or an opt-in structured `context.mentions` channel.

  - New config: `contextMentions` (`enabled`, `sources`, `showButton`, `buttonIconName`, `searchPlaceholder`, `trigger`, `triggerPosition`, `maxMentions`, `maxItemsPerGroup`, `searchDebounceMs`, `llmFormat`, render overrides, `onMentionRejected`/`onMentionResolveError`). See `docs/CONTEXT-MENTIONS.md` for the full reference.
  - New exported helpers for building sources: `defaultMentionFilter` and `createStaticMentionSource`. `createSmartDomMentionSource` (from `@runtypelabs/persona/smart-dom-reader`) gains a `mapItem(el, defaultItem)` option to reshape surfaced items, and `EnrichedPageElement` is re-exported.
  - The "add context" button opens the menu as a picker with a search field at the top (focused on open); no trigger character is inserted, and dismissing leaves the composer text untouched. The typed-`@` path keeps its query in the textarea with no search field.
  - Resolve-on-select by default (cached, abortable) so submit stays instant; per-source `resolveOn: "submit"` for time-sensitive sources.
  - Each resolved mention's body is wrapped in a delimited per-mention block via `contextMentions.llmFormat`: a fenced code block carrying the label (default, with auto-escalating fences so content can't break out), Anthropic's indexed `<document>` shape, or a custom function.
  - Render overrides: `renderMentionMenu` (whole menu; the widget keeps positioning), `renderMentionItem` (one row's inner content, keeping built-in chrome and keyboard nav), and `renderMentionChip` (one chip; receives `ctx.payload` for select-resolved sources so a custom chip can preview fetched content).
  - Accessible by default: listbox semantics with group/setsize/posinset, `aria-activedescendant` mirrored onto the composer, ↑/↓/Home/End navigation, Enter/Tab select, Esc keeps a literal `@`, Backspace removes the last chip, a polite live region, ≥44px touch targets, and a 16px picker input (no iOS zoom). The composer form is a size-query container named `persona-composer` so hosts can hide `.persona-mention-button` responsively to panel width.
  - Disabled by default and lazy: the menu/chip runtime lives in a separate `./context-mentions` subpath / sibling `context-mentions.js` chunk loaded on first use (menu CSS included, so it styles correctly under `useShadowDom`), keeping it out of `dist/index.{js,cjs}` and the core CDN bundle for sites that leave it off.

- eca42fb: The welcome (intro) card now renders flat by default: transparent background and no box shadow, so the greeting reads as plain text on the transcript background. This matches the convention across chat products (plain centered greetings in AI chat UIs, plain header text or a regular bot bubble in support messengers). The previous elevated-card look is still available by setting the `theme.components.introCard.background` and `theme.components.introCard.shadow` tokens.
- 5170022: Add inline context mentions (`contextMentions.display: "inline"`). Selecting an `@` mention inserts a Slack/Linear/Cursor-style atomic token that stays in the sentence, backed by a contenteditable composer, instead of the default chip row. The resolved-context channel is identical in both modes; inline is a display concern. Opt in per widget; the default stays `"chip"`.

  - The contenteditable engine ships as a separate lazy chunk (`context-mentions-inline.js`, ~3 kB gz) loaded on composer mount only when `display: "inline"`, so chip-only and feature-off embeds are unaffected.
  - The same item can be mentioned more than once in a message: each pick inserts its own token, and the submit bundle dedupes the resolved payload by (source, item) so the model receives the context once. Chip mode still rejects duplicates, since its context row is an attachment list.
  - Sent messages carry ordered `contentSegments`, so the sent bubble re-renders each `@token` in place rather than showing prose plus a chip row. Composer-history recall of an inline message restores plain text; live token recall is a known follow-up.
  - The mention menu anchors to the `@` trigger glyph (Slack-style) rather than the composer: horizontally clamped so a near-right trigger shifts the menu left to stay within the composer, vertically anchored to the trigger's line, and re-positioned as the composer auto-grows on line wrap. Chip mode keeps the composer-anchored menu.
  - Tokens render via `renderMentionToken` (in both the composer and the sent bubble); `renderMentionChip` is ignored for `@` mentions in this mode. Tokens announce as one unit to screen readers and speak resolve failures through a dedicated assertive live region (hosted in the light DOM under `useShadowDom`).

- 7c8b4f0: Skills / slash-commands: the context-mentions engine supports multiple trigger channels, so a `/`-command menu can run alongside `@`-context mentions on the same (lazy-loaded) runtime.

  - **Multi-trigger channels.** New `contextMentions.triggers[]` adds extra channels beside the primary `@`. Each channel has its own `trigger`, `sources`, `triggerPosition` (`"anywhere" | "line-start" | "input-start"`), and `allowSpaces` (multi-word queries for command args). The single-trigger config is channel 0; `triggerPosition` is also available on the primary channel.
  - **Commands are verbs.** Mention items may carry `command: "prompt" | "action" | "server"`:
    - `"prompt"` — `resolve()` returns `insertText` (or `llmAppend`), written into the composer per `insertMode` (`"replace"` | `"insert-at-caret"`); `submitOnSelect` sends it immediately. No chip.
    - `"action"` — runs `item.action({ args, config, messages, composer })` in the browser; no chip, no message sent.
    - `"server"` — routed like a `resolveOn: "submit"` mention whose `resolve().context` reaches the backend via request `context.mentions.<sourceId>.<itemId>`. No new wire field or backend change required.
  - **Args and inline completion (Slack-style).** Text after the command name is captured as `args` and passed to `resolve()`/`action()` (`/deploy staging` → `args: "staging"`). A command with `argsPlaceholder` (shown as a `‹hint›` in the menu row) — and every `kind: "server"` command — completes inline: selecting it fills `/name ` into the composer, the user types the argument, and the command runs at send time. Zero-arg commands still run on select.
  - **Helper.** New exported `createSlashCommandsSource({ id, label, commands })` builds a command source that matches on the command name and maps `SlashCommandDefinition`s to items. New public types: `AgentWidgetMentionTriggerChannel`, `AgentWidgetMentionTriggerPosition`, `AgentWidgetContextMentionCommandContext`, `AgentWidgetContextMentionComposerCapability`, and the now-exported `AgentWidgetContextMentionItemRenderContext`.
  - **Bundle.** All command runtime ships in the existing lazy `context-mentions.js` chunk; the core CDN bundle is unchanged. A per-channel affordance button is only painted for channels with sources that opt into `showButton` (extra channels default to typed-trigger only).

### Patch Changes

- c85a75d: Fix context mention chip row staying hidden after the first mention is added. Visibility was computed before the mention was tracked, so the first chip only appeared once a second mention made the row visible.

  Fix custom-rendered mention chips (`renderMentionChip`) not being removable: the status update swapped the chip's DOM node, so remove/clear targeted the detached original instead of the live element.

- 04d8ded: Fix two more context-mention issues: pressing stop while a submit-time mention resolve is still in flight now aborts the turn instead of letting the dispatch proceed, and the inline composer's placeholder updates no longer overwrite an explicit host-provided aria-label.
- 04d8ded: Fix five composer submit / context-mention UX bugs: guard against double-submit during the async pre-send window, finalize chip and command mention bundles independently so one failing side no longer discards the other, deep-merge cross-bundle mention context per source, stop history recall from opening the mention menu, and rebind the left-action cluster after a plugin replaces the composer so the mention and attachment buttons land in the live footer.
- 04d8ded: Fix context-mention edge cases: line-start slash commands that lead any line (not just the first) now dispatch at submit; switching between two channel picker buttons no longer leaves the first button's aria-expanded stuck open; a first-time async mention source no longer double-fetches on its first search; a throwing host llmFormat or onMentionResolveError now drops only that item instead of rejecting the whole submit bundle; and a transient runtime-chunk load failure no longer disables mentions for the rest of the session.
- 61761df: Create the context-mention live regions inside the lazy engine chunk instead of eagerly in the core bundle. Announcements cannot fire before the engine mounts, so behavior is unchanged; the live-region helper no longer ships in index.js. The orchestrator option pair announce/announceError is replaced by liveRegionHost (internal API).
- 541356c: Cut per-keystroke rendering churn in the context mention menu: option rows are now reused across renders keyed by source and item id (listeners attached once, dynamic attributes diffed in place), and lucide icons are built once per shape and cloned. Custom renderMentionItem rows still rebuild each render since hosts own their markup.
- cccc9d1: Inline mention completion now inserts a separating space after the token (matching Slack, Notion, and similar composers), so typing continues naturally and a fresh `@` chains another mention without a manual spacebar press. When the following character is already whitespace, no extra space is added and the caret hops the existing separator.
- 82a77f2: Context mention polish: repeated screen-reader announcements now re-speak (live region clears and sets across separate tasks), the documented `item.group` menu header override is now honored, the mention content segment embeds the full mention ref instead of copying its fields, and the unused composer document APIs (`blocksFromMessage`, `toPlainText`, `ComposerMentionState`, `setDocument`) were removed before first release.
- dfb8ae6: Mention-bearing user messages now render through the same transform pipeline as every other bubble (markdown, postprocessMessage, sanitize): mention slots ride the pipeline as placeholder sentinels and are swapped back to atomic tokens in the parsed output. If a custom transform drops a slot, the bubble falls back to verbatim segment rendering so a mention is never lost. Default-config output is unchanged.
- 541356c: Cache the smart-DOM mention source's page snapshot with a short TTL so the synchronous Shadow-DOM-piercing scan no longer re-runs on every empty query (each `@` open and backspace-to-empty), removing a per-keystroke main-thread stall on content-heavy pages.
- 47cb9d1: Trim widget.css: remove stranded utility rules with no remaining call sites (persona-shadow-md/lg/2xl, persona-bg-gray-200 and its hover variant, persona-border-gray-100, persona-border-persona-secondary, persona-border-t/b-persona-border, persona-pl-7, persona-pr-7, persona-items-end, persona-h-12, persona-w-12, and an artifact copy-label selector that matched no rendered node) and drop the persona-code-block-\* copy-button rules, whose markup the widget never emits (they styled a showcase-only postprocessor and now live with the showcase). Brings the stylesheet back under its 15 kB gzip budget.

## 4.8.0

### Minor Changes

- 88225ea: Add `features.artifacts.layout.chatSurface` for the detached pane appearance. `"flush"` renders the chat flat on the host page so only the artifact pane floats as a card, the elevation-on-the-pane-only reference composition; the default `"card"` keeps two matched cards.

  Flush drops the whole chat card: no border, radius, or shadow, and no backdrop of its own. The container, messages body, and composer footer backgrounds go transparent (the footer's top hairline is dropped too), so the host page shows through behind the transcript, while element surfaces (message bubbles, cards, the composer input) keep the `surface` color. The wrapper paints `theme.components.panel.canvasBackground` (default transparent) as the single token coloring the backdrop behind both the flush chat and the floating pane. The outer panel squares its corners by default since it fills its container flush; an explicit `theme.components.panel.borderRadius` still wins.

  Flush is a steady state: it applies whether or not an artifact pane is open, so opening or closing an artifact never flips the chat chrome. It only takes effect on an inline embed with the detached pane appearance; floating, docked, and sidebar modes fall back to the card look.

- 4819c69: Artifact system overhaul: previewable file artifacts, display modes, inline artifact blocks with document chrome, syntax-highlighted source views, custom action slots, and artifact pane polish.

  **File artifacts and previews**

  - Markdown artifacts carrying optional `file` metadata (path + mimeType) can now preview HTML/SVG in a sandboxed `<iframe srcdoc>` (opaque origin, `allow-scripts` by default, never `allow-same-origin`), render markdown through the usual pipeline, or show source. Cards show the file type and basename, and downloads use the real filename, MIME type, and unfenced content. Configure via `features.artifacts.filePreview` (`enabled`, `iframeSandbox`). `allow-same-origin` in `iframeSandbox` is stripped with a console warning unless the explicit `dangerouslyAllowSameOrigin` flag is set, so the opaque-origin isolation cannot be weakened by a copy-pasted sandbox string. Fully additive: artifacts without `file` behave exactly as before.
  - File previews get a themed loading indicator instead of a blank pre-paint flash: a pure-CSS spinner overlay (icon-first, reduced-motion aware) with a calm label that fades in only after `labelDelayMs` (default 2s), dismissed the instant the content signals it has rendered via an injected `postMessage` ready reporter, with delayed appearance, a minimum-visible window, a fade-out, and a hard timeout. Configure via `filePreview.loading` (`delayMs`, `minVisibleMs`, `timeoutMs`, `injectReadySignal`, `label`, `labelDelayMs`, `renderIndicator`), or `loading: false` for the raw srcdoc. Theming via `--persona-artifact-spinner-size/-color/-track-color/-speed` and `--persona-artifact-frame-bg`; the reusable `persona-spinner` class is exposed for other surfaces.

  **Display modes and inline artifacts**

  - New `features.artifacts.display`: choose `"panel"` (card in transcript + pane auto-opens; the previous default behavior), `"card"` (card only, pane opens on click), or `"inline"` (the preview renders directly in the transcript via the new `PersonaArtifactInline` built-in component), globally or per artifact type via `{ default, byType }`. A `renderInline` hook mirrors `renderCard`, and the pane's body rendering is shared through `renderArtifactPreviewBody()`.
  - Inline blocks render document chrome: a title bar with copy and expand controls, plus a rendered/source segmented toggle on complete file-backed artifacts that have a rendered alternative (same segmented control the pane uses). Expand opens the artifact fullscreen in the pane and fires `onArtifactAction({ type: "open" })`. Themeable via `theme.components.artifact.inline`; hosts can add custom buttons through `features.artifacts.inlineActions`. Opt out with `features.artifacts.inlineChrome: false`, or pass `{ showCopy, showExpand, showViewToggle }` to toggle individual controls.
  - New `features.artifacts.inlineBody` controls how the inline block reserves height while an artifact streams: `streamingView` (`"source"` | `"status"`), `height` (px, `"auto"`, or `{ streaming, complete }`), `followOutput`, `fadeMask`, and `transition`. The default is a fixed 320px streaming source window with internal tail-follow scroll, a top edge fade, and a layout-neutral streaming-to-complete swap; set `height: "auto"` for content-sized streaming. `inlineBody.viewMode: "source"` forces inline blocks to always show raw highlighted source instead of a rendered preview, for hosts where the artifact is input to the host system rather than something to render.
  - The artifact pane no longer renders its preview while hidden: in `"inline"` and `"card"` modes it records state and renders lazily on reveal, so an artifact's scripts execute exactly once (previously a second hidden srcdoc iframe duplicated script side effects and CPU).

  **Source view and syntax highlighting**

  - The artifact source view (pane and inline) now renders syntax highlighting via a built-in lightweight tokenizer (html, css, js, ts, json; no new dependencies) plus a line-number gutter, falling back to plain line-numbered text for other languages and very large sources. Palette and gutter are themeable via `theme.components.code` and default to One Light / One Dark; the dark palette follows the widget's resolved `colorScheme` (stamped as `data-persona-color-scheme` on the widget root), not the OS preference. Source views render full bleed with the gutter flush against the frame edge, and the markup is hardened against host-page `code` styling.
  - The pane's view/source toggle is now a segmented pill in both toolbar presets, with a sliding active highlight (CSS only, honors `prefers-reduced-motion`). New `theme.components.artifact.toolbar` tokens (`toggleGroupPadding`, `toggleGroupBorder`, `toggleGroupBorderRadius`, `toggleGroupBackground`) style the container.

  **Cards, actions, and toolbar**

  - Artifact reference cards render standalone in the thread instead of nested inside a message bubble, matching how Claude.ai presents artifact cards. Components can opt out of bubble chrome via `componentRegistry.register(name, renderer, { bubbleChrome: false })`. Card chrome is themeable through the new `components.artifact.card` tokens (`--persona-artifact-card-bg/-border/-radius/-hover-bg/-hover-border`), with the radius following the assistant bubble radius by default.
  - The card's "Generating…" status animates with the tool-loading animation system (`features.artifacts.loadingAnimation`, default `"shimmer"`).
  - Declarative custom action slots: `features.artifacts.toolbarActions` renders custom buttons in the pane toolbar and `features.artifacts.cardActions` renders them on the reference card (complete artifacts only). Each `PersonaArtifactCustomAction` takes an id, label, an icon (registry name or element factory), optional `showLabel` and per-artifact `visible()` gate, and an `onClick` receiving the artifact context. Card actions are event-delegated so they survive streaming re-renders and page refresh.
  - Optional pane expand/collapse toggle via `features.artifacts.layout.showExpandToggle`: expanding fills the widget with the pane and hides the chat column (desktop split view only). Runtime-only, sticky while visible, interceptable via the new `{ type: "expand", artifactId, expanded }` variant of `onArtifactAction`.
  - The pane copy button copies the raw file source for file artifacts (instead of the fenced code-block markdown) and can now appear on the default toolbar preset via `features.artifacts.layout.showCopyButton` (off by default; the document preset always shows it). The default toolbar Close control is now an icon button.

  **Behavior changes**

  - `session.upsertArtifact()` now also injects the matching transcript block (card or inline) so the programmatic path matches the streamed UX. Pass `transcript: false` to keep the previous registry/pane-only behavior.
  - Artifact cards no longer render inside a message bubble (visible change on upgrade).
  - Inline artifact streaming defaults to the fixed-height tail-follow window described above; set `inlineBody: { height: "auto" }` to restore the previous grow-with-content behavior. The pane is unchanged.

  **Fixes**

  - Hover and active states for icon buttons, label buttons, artifact tabs, and the document toolbar now resolve to a visible gray step when the theme's container color equals its surface (true for the default preset). The reference card gained hover and focus-visible styles, and clicking its Download button no longer also opens the artifact pane.
  - CDN build: content rendered before the lazy markdown-parsers chunk resolves no longer stays as escaped plain text. A shared `onMarkdownParsersReady` registry gives every markdown surface one self-heal path: chat messages and artifact previews (pane and inline) re-render once when the chunk lands, the preview no longer double-escapes the degraded fallback through the sanitizer, the chat subscription is released on widget teardown, and waiting subscribers survive a transient chunk-load failure so a later successful retry still re-renders them. `loadMarkdownParsers` and `onMarkdownParsersReady` are exported from the public API so hosts that inject content right after init can await or subscribe to parser readiness.
  - Empty lines in the source view reserve one line box, fixing gutter numbers painting on top of the next line.

- 88225ea: Artifact pane tab bar overhaul. Tabs no longer overflow the panel: the default strip is a single accessible horizontal scroll strip with a directional edge fade, tabs stay on one line and truncate with an ellipsis, file tabs are labelled by basename with the full path in a tooltip, and the selected tab scrolls into view on selection change. The strip is a keyboard-navigable tablist with roving arrow-key focus, and tabs show a themed focus ring (`.persona-artifact-tab:focus-visible`, matching the artifact cards and icon buttons) instead of the browser default outline.

  Hosts can replace the bar entirely via the `features.artifacts.renderTabBar` hook, with the exported `createRovingTablist` helper for accessible custom bars. A `renderTabBar` hook may return the same element across invocations and the pane skips remounting it, so a custom bar keeps its internal state (notably roving keyboard focus) across selection changes; custom bars that reuse `.persona-artifact-tab` inherit the same focus ring.

- 88225ea: Add a detached panel appearance. `launcher.detachedPanel` renders the chat panel as an inset card with elevation in sidebar, docked, and inline embed modes, themed via the new `components.panel.inset` and `components.panel.canvasBackground` tokens. The artifact pane gains a matching `paneAppearance: "detached"` treatment that defaults on when the panel is detached.

  In the desktop side-by-side layout, a detached split gives each surface its own perimeter instead of nesting a double card: the outer panel drops its union shadow (which used to wrap the chat column, the transparent gap, and the pane together) and the chat column gains its own matching card chrome beside the pane. In inline embeds, `paneAppearance: "detached"` also insets the whole split from its container edges (previously the outer margin required `launcher.detachedPanel`), matching docked and sidebar. Narrow-host drawer and mobile fullscreen are unchanged: the panel stays the single visible card.

  Elevation customizes per card through `theme.components.panel.shadow`, and the new `features.artifacts.layout.chatShadow` (token `--persona-artifact-chat-shadow`) can keep the chat column flat while the artifact pane stays raised. It defaults to matching the pane elevation, so detached splits render unchanged unless set.

- 88225ea: Flush inline embeds (`launcher.enabled: false` without `detachedPanel`) no longer render the default `palette.shadows.xl` panel shadow. The shadow was almost always clipped invisible by the embed's own overflow container, so this mostly formalizes existing rendering; hosts that did see it can restore it with `theme.components.panel.shadow`. Floating panels and detached cards keep their elevation defaults.
- ef1de18: Inline artifact streaming UX upgrade, aligning the inline block with the norms set by Claude.ai, ChatGPT Canvas, Copilot, and the Vercel Chat SDK:

  - **New `inlineBody.overflow`** (`"scroll" | "clip"`, default `"scroll"`). `"clip"` renders a fixed-height window showing the top of the document with `overflow: hidden` and no internal scroll or tail-follow (`followOutput` is ignored). A bottom edge fade appears when content overflows, and when the inline chrome's Expand control is enabled the whole body doubles as an expand hitbox: click, Enter, or Space opens the artifact in the pane. An explicit `fadeMask` still wins over the clip-mode fade default.
  - **New `inlineBody.completeDisplay`** (`"inline" | "card"`, default `"inline"`). With `"card"`, the block streams inline as configured and then collapses to the compact artifact reference card once the artifact completes. The collapse is a staged handoff: the streamed body fades out in place, then the block height collapses (distance-scaled duration on the M3 standard curve) while the card fades in. It runs on the Web Animations API so it survives the DOM churn around stream completion, and degrades to an instant swap under `prefers-reduced-motion`. Blocks that arrive already complete, such as on page-refresh hydration, render the card directly with no flash of the inline body. After collapse the card's normal actions apply; `viewMode`, the view toggle, `inlineActions`, and inline copy are streaming-phase-only in this mode.
  - **Streaming-to-complete swap.** The animated View Transition for the inline body swap is skipped while the session is still streaming: it captures the whole document, so cross-fading it over a transcript whose text is still moving produced a ghosting effect on chat messages. The swap still happens instantly mid-stream; the animated transition still runs when the swap lands after the stream has ended.
  - **Gesture-based unstick.** Streaming source windows now stop tail-following on an upward wheel or touch gesture, not just on scroll position, and re-engage when the reader returns within 40px of the bottom or the stream completes. Growth-induced scroll is never mistaken for reader intent, so follow no longer freezes mid-stream.
  - **Fade-mask defaults.** The edge fade size fallback moves from 24px to 40px, and the default `inlineBody.fadeMask` is now top+bottom instead of top-only. The bottom fade is clip-gated at render time: it stays inert while tail-follow is pinned and only appears when the reader scrolls up mid-stream. Themes pinning `--persona-artifact-fade-size` are unaffected.
  - **New `artifacts.statusLabel`** (`string` or a function). Replaces the default `Generating <type>...` streaming status across all three surfaces: the reference card status line, the inline chrome meta label, and the inline status body. A string localizes or rebrands the label everywhere. A function runs per streaming update for each visible surface and receives a context (`artifactId`, `artifactType`, `title`, `typeLabel`, `file`, `chars`, `lines`, `elapsedMs`, a lazy `content()` accessor, and the `surface`). Return a string for the label only, or `{ label, detail }` to add a plain detail span that updates freely per delta for live counters, while the animated label re-applies only when its text changes so the loading animation never restarts. A throwing callback falls back to the default label. There is no percent progress by design, since streams do not announce total length.

- 88225ea: Panel and seamless artifact splits now render as one welded card. In the desktop side-by-side layout, the card border and radius wrap the chat column and the artifact pane together (the border moves onto the outer panel, which already carried the union radius and shadow), instead of bordering only the chat column and leaving the pane as a naked glued-on slot. `panel` shows a hairline divider on the pane's chat-facing edge; `seamless` shows no internal chrome at all. The default 0.5rem split gap and the faint pane left shadow are removed for these appearances (both weld at gap 0). `detached` is unchanged (two separate elevated cards with the page showing through the gap). Narrow-host drawer and mobile fullscreen are unchanged. An explicit `splitGap`, `paneBorder`, `paneBorderLeft`, or `paneShadow` still overrides the welded defaults.

  `unifiedSplitChrome` is now deprecated and a no-op: welding is the default for panel and seamless, so the option no longer changes rendering (and no longer warns when combined with `detached`). `unifiedSplitOuterRadius` is still honored as an override of the pane's outer-right corner radius; when unset, the welded outer corners now derive from the same resolved panel radius as the chat card, so a custom `components.panel.borderRadius` stays symmetric across the card.

  The welded chrome now stands down whenever the widget is in mobile fullscreen, including a fullscreen driven by a custom `launcher.mobileBreakpoint` above 640px, so a fullscreen panel no longer paints welded corner radii onto its flush layout. A docked widget with a welded split keeps a dock-facing hairline against the host page, and an explicit nonzero `splitGap` is now honored geometrically in welded splits (resize clamps and the seam handle account for the gap).

### Patch Changes

- ea30232: Keep the composer bar mounted when the artifacts split layout is enabled, show its suggestion chips when expanded, support summary-only grouped tool activity across hidden reasoning rows, and allow product-facing artifact toolbar labels.
- eff31f5: Reduce bundle size ~14 kB gzip per bundle by raising the build target from ES2019 to ES2020, removing `?.`/`??` downleveling. No functional support change: the widget already requires newer browsers at runtime (`replaceChildren`, `Promise.allSettled`) than the ES2020 syntax floor. Also drop the unused `zod` dependency
- 7396fd1: Remove the dead `new URL("../widget.css", import.meta.url)` stylesheet lookup from widget init. Webpack statically resolves the literal and fails consumer builds (Next.js: "Module not found: Can't resolve '../widget.css'") now that the ES2020 target preserves `import.meta`. The lookup has returned null in every shipped bundle, so removal is behavior-preserving: styles continue to arrive via the installer's injected link tag or an explicit `@runtypelabs/persona/widget.css` import, and shadow roots still clone the installer's head link.

## 4.7.0

### Minor Changes

- 0bc84ed: Send a refreshed WebMCP `clientTools[]` snapshot on client-token resume (`POST /v1/client/resume`), using the same diff-only / send-once protocol as the chat path: fingerprint-only when the page's tool registry is unchanged, full array + fingerprint on change or after a `409 client_tools_resend_required` (retried exactly once). Tools registered by a mid-run page navigation now become callable on the next model turn instead of staying frozen at dispatch time. When the registry vanished after a non-empty send, the widget ships an explicit `clientTools: []` so the server replaces the persisted set. Fully backward compatible: older servers strip the unknown fields and keep the frozen-at-dispatch behavior.

### Patch Changes

- 4ff39ba: Serialize storage mutations, honor pre-aborted dispatches, and coalesce streaming transcript updates per animation frame.

## 4.6.1

### Patch Changes

- 0a425f2: Fix Vite 8 (Rolldown/Oxc) consumers: the minified dist contained an `in` expression inside a `for(init;;)` head (via an arrow body), a shape Oxc mis-parses ("Expected a semicolon") and Rolldown can silently emit as an empty chunk. The two `"message" in e` error guards are now `Reflect.has(e, "message")` (identical `[[HasProperty]]` semantics), and the build gains a dist-scan gate (`check:dist-vite8`) that fails if the toxic shape ever reappears in `dist/`.
- f165f4e: Fix the live tool-duration counter flickering between `<0.1s` and `0.1s` while a tool stays active. The `{duration}` span is updated by a 100ms global timer, but idiomorph was re-stamping it with the render-time value on every transcript re-render (when `loadingAnimation` is `"none"`, the tool title isn't preserved across morphs), so the two writers fought around the sub-0.1s boundary. The morph now leaves a still-live `[data-tool-elapsed]` span to the timer and only re-morphs it once the tool completes (or its slot is reused).
- 9105cae: Regenerate the Runtype OpenAPI contract types from the latest published spec (adds `blockReason`, `approvalId`, and subagent `parentToolCallId` fields to stream event types). Fixes the `check:runtype-types` CI gate.

## 4.6.0

### Minor Changes

- 925e991: Add durable-session reconnect for resumable agent turns: any long-running, server-persisted execution whose stream carries an SSE `id:` cursor (e.g. Claude Managed agents, or async/background agent runs). When a streaming connection drops mid-turn (tab reload, sleep, network blip, stream timeout), the widget now reads the SSE `id:` cursor, detects a non-graceful drop (vs. a finish or an intentional pause), and auto-reconnects with bounded backoff to replay the missed frames and keep filling the same assistant message instead of finalizing a truncated answer.

  New config: `reconnectStream` (host-owned reconnect transport, symmetric to `customFetch`), `onExecutionState` (surface the resume handle for persistence), `resume` (boot-time tab-reload resume), and `reconnect` (backoff tuning). New `paused`/`resuming` statuses with `statusIndicator.pausedText` / `resumingText` copy, `stream:paused` / `stream:resuming` / `stream:resumed` controller events, and a `controller.reconnect()` manual retry. Self-gating: reconnect only arms on the durable lane (streams carrying `id:` lines); every other stream finalizes on drop exactly as before.

  The reconnect orchestration (backoff loop, focus/online wake listeners, give-up finalizer) is loaded lazily via a dynamic import the first time a reconnect actually starts, so it stays out of bundles that never opt into `reconnectStream`. The bundler-consumed `theme-editor/preview` subpath now code-splits it into a separate chunk; the single-file IIFE and main ESM bundles inline it as before.

### Patch Changes

- ef10a49: Fix `controller.update()` not activating plugin-based stream animations. Built-in animations applied live (they carry their CSS in the widget stylesheet), but plugin animations (`wipe`, `glyph-cycle`, and custom plugins registered via `registerStreamAnimationPlugin`) inject their styles through `ensurePluginActive`, which only ran at mount. Switching to a plugin animation via `update()` now injects its CSS so it renders, matching the initial-mount behavior. The call is idempotent, so re-selecting an already-active plugin is a no-op.

## 4.5.0

### Minor Changes

- 87bd7b8: Add additive, opt-in `features.scrollBehavior` options for scroll-engineering control. All default to the existing behavior, so nothing changes unless you opt in:

  - `restorePosition: "last-user-turn"` — reopen a saved conversation with the last user message pinned near the top of the viewport instead of jumping to the absolute bottom.
  - `pauseOnInteraction: true` — treat keyboard navigation (PageUp/PageDown/Home/End/arrows) and focusing a link/control inside the transcript as intent to stay put, pausing auto-follow (previously only wheel/scroll/text-selection did).
  - `showActivityWhilePinned: true` — surface the "new messages below" count and a streaming-below hint (a `data-persona-scroll-to-bottom-streaming` attribute on the jump-to-latest affordance) even in `anchor-top` mode.
  - `announce: true` — maintain a visually-hidden `aria-live="polite"` region that announces response start/finish and "N new messages below" at a calm, debounced cadence (never token-by-token).

  Also exports the `AgentWidgetScrollMode`, `AgentWidgetScrollRestorePosition`, `AgentWidgetScrollBehaviorFeature`, `AgentWidgetScrollToBottomFeature`, and `AgentWidgetComponentRenderer` types from the package root.

- 87bd7b8: **Default scroll behavior changed: `anchor-top` is now the default.**

  The streaming transcript now defaults to `features.scrollBehavior.mode: "anchor-top"` (ChatGPT-style: the sent message pins near the top of the viewport and the reply streams into the space below) instead of `"follow"` (stick to the bottom). The unread-count + "streaming below" hint (`showActivityWhilePinned`) also now defaults **on**, so activity arriving off-screen under the pinned turn stays visible.

  Turns with no user send to anchor to — a proactive greeting, an injected assistant message, a resubmit, or first-load streaming — automatically fall back to follow-to-bottom for that turn, so content never streams in off-screen.

  **To restore the previous behavior**, set the mode explicitly:

  ```js
  initAgentWidget({
    config: {
      features: { scrollBehavior: { mode: "follow" } },
    },
  });
  ```

  To keep `anchor-top` but silence the pinned-turn activity hint, set `features.scrollBehavior.showActivityWhilePinned: false`.

### Patch Changes

- 156c69f: Fix `anchor-top` scroll: keep follow-on assistant content pinned instead of yanking the viewport to the bottom. Once a user send has anchored the conversation, the anchor now holds across the whole turn — a multi-part reply, an injected embed (tweet/image), or a tool result no longer re-arms the follow-to-bottom fallback, so a late-loading embed can't pop the scroll down to itself. The fallback now applies only when nothing has anchored the conversation yet (first-load or proactive-first streaming).

## 4.4.2

### Patch Changes

- 020652e: Minify the published `dist/widget.css`. It was previously shipped verbatim with all of its authoring comments, so the stylesheet is now ~43% smaller gzipped (and ~41% smaller brotli) over the wire, with no rule or class-name changes. The hand-authored `src/styles/widget.css` stays the commented source of truth; only the built artifact is minified.

## 4.4.1

### Patch Changes

- 62dcd56: Fix the event stream inspector reappearing stacked above the chat messages when the window is resized across the mobile/fullscreen breakpoint. The fullscreen layout reset was wiping the `display: none` that hides the messages body while the stream is open; it's now preserved, so the event panel keeps taking over the full chat area at every width.
- 71c9066: Simplify and fix the event stream toolbar so it no longer overflows in narrow panels. The total event count now lives in the "All events (N)" filter option (matching the per-type options) instead of a separate count badge, and the redundant "Events" and "Throughput" labels are removed (the tok/s value is self-describing and the throughput's accessible name is preserved via aria-label). At very narrow widths the "Copy All" button collapses to icon-only as a last resort.
- 4e85f3f: Markdown tables now span the full chat column. A table-bearing assistant bubble grows to fill the row (`:has(table)`) instead of shrink-wrapping to its content, which fixes the table visibly collapsing to a narrow width when the streaming column-width lock is released.

## 4.4.0

### Minor Changes

- ced75a9: Add `launcher.agentIconBackgroundColor` to set a custom background color for the launcher's agent icon circle, independent of the primary button color. Mirrors the existing `callToActionIconBackgroundColor` option.

### Patch Changes

- c62bdb3: Wire the `theme.components.introCard.background` token to the welcome card. The token (`--persona-intro-card-bg`) was already computed from config but never applied to the element, which hardcoded the `--persona-surface` utility — so `introCard.background` was silently ignored. The card now reads `--persona-intro-card-bg` (falling back to `--persona-surface` when unset), matching how `introCard.shadow` already works and keeping existing pages visually unchanged.

## 4.3.1

### Patch Changes

- 08138f2: Wrap long unbreakable tokens (URLs, package names) inside message bubbles instead of overflowing horizontally. Adds `overflow-wrap: break-word` to `.persona-message-bubble` so links and prose stay within the bubble's max-width.

## 4.3.0

### Minor Changes

- 900016c: Add agent-first routing config. The widget now accepts a saved-agent `agentId` and a normalized, backend-neutral `target` string (`"agent_…"`/`"flow_…"` Runtype TypeIDs, or `"<provider>:<id>"` resolved via a pluggable `targetProviders` registry). The proxy sends saved-agent dispatches using Runtype's `agent.agentId` payload shape.

## 4.2.1

### Patch Changes

- 3126294: Fix duplicated final assistant message on flow continuation streams. A tool-driven `/resume` continues a flow on a fresh stream that does not re-emit `execution_start`, so the stream defaulted to agent mode and mis-routed the final prompt-step finalization — rendering the streamed text once and then a second time from `step_complete.result.response`. The client now recovers the flow execution kind from the leading `step_*` frame when `execution_start` is absent, so the finalization reconciles in place. Agent streams are unaffected (they carry no `stepType`).

## 4.2.0

### Minor Changes

- e092be9: Redesign the default tool-approval bubble as a neutral surface card

  The built-in approval UI is now a neutral "permission card" — a tool icon, a
  "The assistant wants to use **tool**" title, the agent-facing description and
  call arguments collapsed behind a "show more" disclosure, and a primary action
  anchored to the brand `--persona-primary` token. On resolve, approved approvals disappear (the tool
  call takes over the transcript) and denied/timed-out ones collapse to a subtle
  one-line trace.

  New `config.approval.enableAlwaysAllow` (default `false`): when enabled, the
  primary becomes a split **Always allow / Allow once** control with a dropdown and
  keyboard shortcuts (Enter / Cmd-Ctrl+Enter / Esc), forwarding `{ remember: true }`
  to your `onDecision` handler. Keep it off unless your backend persists the
  don't-ask-again policy.

  **Visual change for un-configured widgets:** the default look shifts from the
  yellow "Approval Required / Approve / Deny" bubble to the neutral card (primary
  button from green to the brand primary). All `config.approval.*` overrides still
  function and the `--persona-approval-*` CSS variables are honored fallback-first,
  so themed widgets are unaffected. To restore the old look, set
  `config.approval.backgroundColor`/`borderColor` (or the
  `components.approval.requested.*` tokens) back to the warning palette. Note:
  `config.approval.title` no longer renders in the default card — use
  `formatDescription` to customize the summary line. A custom `renderApproval`
  plugin still fully overrides the default.

## 4.1.0

### Minor Changes

- 775a3ed: Stabilize markdown tables during streaming (Telegram-style space reservation). While a message streams, tables-in-progress now render as a real `<table>` from the first row with a stable column count instead of flipping from a paragraph and reflowing on every chunk: the delimiter row is completed as soon as it starts arriving, the trailing partial row is padded to the header's column count, and `table-layout: fixed` locks column widths so rows append vertically without horizontal jiggle. Columns relax to natural content-fit widths once streaming completes. The final, non-streaming render is unchanged.

## 4.0.0

### Major Changes

- 480d980: Handle `agent_await` as a distinct local-tool pause event for agent dispatch, alongside the existing `step_await` for flow dispatch. Both resolve through the same `/resume` path; agent page tools (`origin: "webmcp"`) carry a bare tool name on the wire and are normalized to the `webmcp:`-prefixed form internally, and `awaitedAt` is accepted as the pause timestamp.

  This is part of the 4.0 wire-protocol change that gives flow vs. agent awaits distinct event types (`step_await` vs `agent_await`) for observability and debugging. The Runtype API emits `agent_await` for agent dispatch; widgets must be on 4.0+ to render agent-dispatch local-tool pauses.

- 958e1fd: Persona 4.0: the widget now consumes the neutral 33-event unified SSE vocabulary natively off the wire.

  - The dispatch handler renders unified events (`execution_*`, `turn_*`, `step_*`, `text_*`, `reasoning_*`, `media_*`, `artifact_*`, `tool_*`, `approval_*`, `await`, `source`, `error`, `ping`, `custom`) directly — no legacy-wire translation bridge, no `events` config, no `?events=` query param, no `partId` segmentation.
  - **Agent path** and **flow path** both supported on the unified wire. Assistant bubbles segment on the **text block id** (`text_start`/`text_complete`), sealed at every tool/media/approval/await boundary. Flow prompt-step text continues to run through the streaming structured-content parser (structured-output flows keep their UX); `step_complete.result.response` reconciles the authoritative final, `execution_complete.finalOutput` finalizes.
  - **Nested flow-as-tool attribution.** Text/reasoning blocks carrying `parentToolCallId` (a flow running as a tool) are routed into the parent tool's row (`agentMetadata.parentToolId`) instead of the top-level assistant channel.
  - Reflection folds to `reasoning_complete{ scope:"loop" }`; skills fold to `tool_complete{ result.kind }`; iteration is a denormalized field. Recoverable `error` is non-terminal; `execution_error` is terminal. `text_complete`/`reasoning_complete` now carry the assembled `text` (consumed without double-counting deltas).
  - Adds `scope?: "turn" | "loop"` to `AgentWidgetReasoning` so loop-level reflections stay distinguishable from per-turn thinking.

  The version bump is what arms the API's unified-by-version default via the `X-Persona-Version` header. Requires the Runtype API resume/unified support to be live in production before release.

- 6c53c9b: Remove the deprecated `onReady` callback and the `persona:ready` DOM event. Both were aliases of `onChatReady` / `persona:chat-ready` and have logged a deprecation warning since they were renamed. Migrate any `onReady` install/init option to `onChatReady`, and any `persona:ready` event listener to `persona:chat-ready`.

### Patch Changes

- 91beb60: Fix manual text copy (triple-click + Ctrl/Cmd-C) from message bubbles attaching stray leading/trailing blank lines. The widget now normalizes the clipboard's plain text to match the visible selection, while preserving interior newlines and first-line indentation.
- ef326bb: Fix double HTML-escaping of message text (e.g. apostrophes rendering as `&#39;`) while the markdown/DOMPurify chunk is still loading — or fails to load — in the IIFE/CDN build. The render layer no longer re-runs the sanitizer over already-escaped output, so degraded mode escapes exactly once.
- 90e892f: Improve tool-bubble readability in dark themes.

  - The code blocks (Arguments / Activity / Result) were rendered with a hardcoded white background (`persona-bg-white`) paired with `persona-text-persona-primary` text, so the brand-tinted primary color — which is typically light in a dark theme — landed on a fixed white box (~2:1 contrast). The blocks now default to a matched, theme-aware token set (`--persona-container` background, `--persona-text` foreground, `--persona-border` border) that flips together with the active color scheme, restoring readable contrast in both light and dark modes. An explicit `toolCall.codeBlockBackgroundColor` / `codeBlockTextColor` / `codeBlockBorderColor` still takes precedence.
  - The collapse/expand chevron defaulted to `currentColor`, which often rendered darker than the tool-call title. It now defaults to the title color (`var(--persona-primary)`, the same fallback the title uses), so the toggle stays as readable as the title unless `toolCall.toggleTextColor` / `headerTextColor` overrides it.

## 3.37.0

### Minor Changes

- 414bd33: Add opt-in `events: 'unified'` support. When set, the widget requests the API's neutral unified SSE vocabulary (`?events=unified` on dispatch and `/resume`) and bridges each frame back onto the existing event handlers, so rendering is unchanged. Defaults to `'legacy'`; the wire mode is auto-detected from the first stream frame, so an upstream that doesn't support the param falls back to legacy automatically. Also exposed as a top-level `events` option on the script-tag installer.

### Patch Changes

- 7116233: Regenerate the Runtype OpenAPI contract to add the optional `untrustedContentHint` field on chat requests, syncing the committed types with the live spec.

## 3.36.0

### Minor Changes

- f90ec29: Broadcast the widget version as an `X-Persona-Version` request header. The widget now sends its package version on every outgoing request (chat dispatch, session init, feedback, approve, and resume), and the proxy allows the header through CORS and forwards it upstream to the Runtype API.

## 3.35.0

### Minor Changes

- 9f65d05: Add `createPcmStreamPlayer` — a reusable, jitter-buffered AudioWorklet player for raw PCM16 / 24 kHz / mono streams, exported from `@runtypelabs/persona/voice-worklet-player` alongside the new `PcmStreamPlayer` type. It's the same worklet engine that backs the realtime voice provider, now generalized: a configurable `prebufferMs` waterline, graceful underrun handling (a late chunk produces brief silence and a re-buffer rather than a click), `pause()`/`resume()` via the AudioContext, and an `onStarted` callback that fires when audible playback actually begins (so a UI can hold a loading state through the prebuffer instead of flipping to "playing" on the first byte).

  This is the recommended way to play streamed audio inside a hosted `SpeechEngine` (the per-message "Read aloud" / auto-speak seam). A server TTS engine that streams PCM — OpenAI, ElevenLabs, Azure, etc. — can feed each chunk to the player and get gapless playback with the right latency↔smoothness trade-off for bursty HTTP-delivered audio, instead of hand-scheduling `AudioBufferSourceNode`s (which clicks under jitter). See `examples/embedded-app/src/server-tts-engine.ts` for a complete streaming engine built on it.

  `createWorkletPlaybackEngine` (the realtime voice provider's `createPlaybackEngine` injection) is unchanged — it's now a thin alias of `createPcmStreamPlayer` with the default prebuffer.

- 253c7b1: Add a per-message "Read aloud" action button (text-to-speech) to assistant messages, next to copy/feedback. Enable via `messageActions.showReadAloud: true`. Clicking cycles play → pause → resume (or play → stop when the engine can't pause); the button icon reflects state and survives DOM morphs.

  Speech is produced by a pluggable `SpeechEngine`. The browser Web Speech API engine (`BrowserSpeechEngine`) is the zero-backend default; supply a hosted engine (e.g. Runtype TTS, ElevenLabs, a server proxy) via `textToSpeech.createEngine` to use server-side voices — such an engine can stream audio through the realtime voice `VoicePlaybackEngine`. Voice, rate and pitch come from the existing `textToSpeech` config. The spoken text is resolved from the message body: an action-format envelope (`{"action":"message","text":"…"}`, optionally fenced) speaks its `text` field, otherwise Markdown is stripped to plain prose.

  New public API: controller methods `widget.toggleReadAloud(id)`, `widget.stopReadAloud()`, `widget.getReadAloudState(id)`, `widget.onReadAloudChange(cb)`; a `message:read-aloud` controller event (`widget.on('message:read-aloud', e => …)`, parallel to `message:copy`/`message:feedback`) that fires on every state transition — `loading` (press) → `playing` → `paused`/`playing` → `idle` — with the message id preserved even on the terminal `idle`; exported types `ReadAloudState`, `SpeechEngine`, `SpeechRequest`, `SpeechCallbacks`, `AgentWidgetReadAloudEvent`; exported `BrowserSpeechEngine`, `ReadAloudController`, `pickBestVoice`. The existing auto-speak path (`textToSpeech.enabled`) now routes through the same controller, so a message can't be double-spoken and the button reflects auto-speak playback.

  The theme editor (`@runtypelabs/persona/theme-editor`) gains a "Show Read Aloud" toggle in its Message Actions section.

- a67af86: Rewrite the `runtype` voice provider to the streaming realtime protocol so it actually speaks. It now connects to `/ws/agents/:agentId/voice` with subprotocol auth (`['runtype.bearer', token]`, never a query-string token), streams continuous PCM16 mic audio, and plays back streamed audio replies, replacing the dead legacy turn-based path.

  - **Live transcripts (Option B):** new optional `VoiceProvider.onTranscript(role, text, isFinal)` drives the chat thread from streaming transcript frames: interim user text grows live, the user message finalizes immediately, and the assistant reply lands in sync with its audio.
  - **Pluggable playback:** the default `AudioPlaybackManager` is used unless you inject a custom engine via `voiceRecognition.provider.runtype.createPlaybackEngine`. A jitter-buffered AudioWorklet engine ships from the optional subpath `@runtypelabs/persona/voice-worklet-player`.
  - **Latency metrics:** new optional `VoiceProvider.onMetrics` plus a `voiceRecognition.onMetrics` config hook surface per-turn latency.
  - **Bring-your-own provider:** `voiceRecognition.provider` now accepts `type: 'custom'` with a `custom` field: either a `VoiceProvider` instance or a `() => VoiceProvider` factory. STT-style custom providers deliver a final transcript via `onResult` (sent as a user message); the composer mic now renders for custom providers regardless of Web Speech support. See the `custom-voice-provider` example for a Web Speech adapter.
  - **Simpler config:** `runtype.clientToken` and `host` are now optional, defaulting from the widget's `clientToken`/`apiUrl`: the minimum voice config collapses to just `{ agentId }`. `pauseDuration`/`silenceThreshold` are deprecated no-ops on the realtime path (the server's STT owns turn-taking).

- 6884ee3: Add a built-in Runtype hosted TTS provider for read-aloud. `textToSpeech: { provider: 'runtype' }` now powers the per-message "Read aloud" button (and auto-speak) with a new built-in `RuntypeSpeechEngine` that streams PCM from Runtype's `POST {host}/v1/agents/:agentId/speak` endpoint. `host`/`agentId`/`clientToken` are derived from the widget config (new `textToSpeech.agentId`/`host`/`prebufferMs` options, falling back to `apiUrl`/`voiceRecognition.provider.runtype.agentId`/`clientToken`).

  Playback defaults to a main-thread `AudioPlaybackManager` (in-bundle, with prebuffer, pause/resume, graceful-underrun softening and a real "audible start" signal). For the higher-quality jitter-buffered AudioWorklet player, pass the new `textToSpeech.createPlaybackEngine` and import `createPcmStreamPlayer` from `@runtypelabs/persona/voice-worklet-player` — it then ships in your bundle, not Persona's.

  Unless `browserFallback: false`, the engine is wrapped in a `FallbackSpeechEngine` so a missing endpoint or transient failure transparently falls back to the browser voice — never a broken button — and auto-upgrades to Runtype voices once the endpoint answers.

  Bundle impact: `provider: 'runtype'` is opt-in, so the whole read-aloud engine (`RuntypeSpeechEngine` + `FallbackSpeechEngine` + its `AudioPlaybackManager`) is code-split out of the CDN payload (`index.global.js`) into a lazy `runtype-tts.js` chunk (~2 kB), loaded on demand and prefetched at init so first-audio latency is unchanged. npm/bundler consumers get it inlined (and tree-shaken when unused). `RuntypeSpeechEngine`, `FallbackSpeechEngine`, and their option types are exported from `@runtypelabs/persona/voice-worklet-player`.

- 58a4e93: Split `@runtypelabs/persona/theme-editor` into a headless core (~30 kB gzip) and a new `@runtypelabs/persona/theme-editor/preview` subpath for `createThemePreview` (mounts the full widget). Import preview helpers from the headless path; import `createThemePreview` from `./theme-editor/preview` instead of `./theme-editor`.
- dc7cf1d: Add a `voice:status` controller event exposing the granular `VoiceStatus` (`listening` / `processing` / `speaking` / `idle` / …) on every transition. Subscribe via `widget.on('voice:status', (e) => e.status)`. Complements the existing coarse `voice:state` (active on/off) event — non-breaking. The new `AgentWidgetVoiceStatusEvent` payload type is exported.

  Also fix the message render cache: `computeMessageFingerprint` now includes `voiceProcessing`, so a voice message whose `voiceProcessing` flag flips `true→false` on transcript finalize (typically with unchanged text) re-renders instead of being served the cached in-progress bubble. This previously caused custom voice-processing UIs (via `postprocessMessage` or a `renderMessage` plugin) to stick on finalized messages.

### Patch Changes

- 12e5db2: Fix the header icon color not persisting after runtime config/theme updates. `controller.update()` re-rendered the header Lucide icon with a hardcoded white stroke, overriding the themed `components.header.iconForeground`. The icon now renders with `currentColor` (matching the initial render), so the configured/themed header icon color sticks across updates (including live changes from the theme editor).
- f0d2aa9: Fix the `inline` message timestamp position rendering on its own line (identical to `below`). The inline timestamp was a block-level `<div>` that relied on a `persona-inline` class absent from the stylesheet, and even once tucked into the message text it was invalid markup (`<div>` inside `<p>`) that got re-parented onto its own line on every re-render. Inline timestamps now render as an inline `<span>` (`persona-timestamp-inline`, `display: inline-block`) tucked into the last content block, so they trail the final line of the message and survive re-renders — making `layout.messages.timestamp.position: "inline"` visually distinct from `"below"`.
- ## 02d9183: Reduce em dash sentence constructions across package source and documentation.

  "@runtypelabs/persona": patch
  "@runtypelabs/persona-proxy": patch

  ***

  ## Reduce em dash sentence constructions across package source and documentation.

  "@runtypelabs/persona": patch
  "@runtypelabs/persona-proxy": patch

  ***

  ## Reduce em dash sentence constructions across package source and documentation.

  "@runtypelabs/persona": patch
  "@runtypelabs/persona-proxy": patch

  ***

  Normalize em dash punctuation to ASCII hyphen separators across package source and documentation.

- d4578ee: Reduce widget bundle pressure by slimming the deferred launcher bundle and trimming theme editor metadata.
- 10e654c: Internal refactor of widget UI assembly. Component construction now flows through a small `components/widget-view.ts` view layer (`createWidgetView` / `resolveLauncher`) that groups the shell, transcript, header, composer, and launcher element references into named regions, while `ui.ts` keeps owning behavior. Composer/header parts also expose stable `data-persona-composer-*` ref attributes so plugin and config-driven replacement no longer depends on brittle compound class selectors. No public API or visual changes.

## 3.34.1

### Patch Changes

- ef7e489: Include the client token in feedback requests (thumbs up/down, copy, CSAT, NPS) so the API can scope feedback to the originating session.

## 3.34.0

### Minor Changes

- 76223e9: Model the full dispatch tool-config surface on `AgentToolsConfig`: `toolCallStrategy`, `perToolLimits`, `approval.requestReason`, `subagentConfig` (spawn_subagent orchestration), and `codeModeConfig`. The widget already passed these through verbatim at runtime; consumers no longer need a type cast to configure subagent orchestration.

### Patch Changes

- b380851: Fix push-dock reveal breaking `position: fixed` host chrome. The push track was offset with a CSS `transform`, which made it the containing block for any `position: fixed` descendant, so viewport-fixed elements rendered inside the pushed content (e.g. a host app's `fixed top-0 right-0` toolbar) resolved against the track and landed the panel width off-screen. The track now uses a `margin-left` offset, which produces the identical visual push without establishing a containing block, so fixed (and sticky) descendants resolve against the viewport again.
- 2d06038: Follow-ups to the docked `reveal: 'push'` margin-offset fix (#287): reset the push track's `marginLeft` when entering mobile fullscreen so a stale desktop push offset can't shift the full-width track off-screen, and document that `position: fixed`/`sticky` content inside the wrapped target stays viewport-anchored (offset it with `[data-persona-dock-open="true"]` while the dock is open). Docs updated in README, THEME-CONFIG, and CONFIGURATION-REFERENCE to describe push sliding via margin rather than transform.
- 279b173: Bump safe non-breaking dependencies.

## 3.33.0

### Minor Changes

- fcdd706: Built-in `ask_user_question` client tool, exposable via a config flag.

  - **`features.askUserQuestion.expose: true`** advertises a built-in `ask_user_question` tool definition (model-facing description + JSON schema matching `AskUserQuestionPayload`) to the agent on every dispatch via `clientTools[]`: the same wire surface as WebMCP page tools. No server-side `runtimeTools` declaration needed; the server registers it as a bare-named LOCAL tool and the existing answer-pill sheet / `/resume` round-trip handles the call. Defaults to `false` (flows that already declare the tool server-side would otherwise present it twice), and is ignored when `enabled: false` so the agent is never offered a question tool the widget can't render an answer UI for.
  - **Exports** `ASK_USER_QUESTION_CLIENT_TOOL`, `ASK_USER_QUESTION_PARAMETERS_SCHEMA`, and `builtInClientToolsForDispatch` so integrators who prefer the server-side `runtimeTools` declaration can reuse the same description and schema.
  - **Fix:** `ClientToolDefinition.origin` is now typed `'webmcp' | 'sdk'` (was `'webmcp' | 'local'`). `'local'` was never accepted by the server's dispatch validation and would have failed the request with a 400.

- c5eb722: Docked mode now guards against pages that don't provide a definite height. The dock panel is clamped to the new `launcher.dock.maxHeight` (default `100dvh`; `resize`/`emerge` reveals are additionally pinned with `position: sticky`) so a missing `html, body { height: 100% }` chain degrades to a viewport-sized, internally-scrolling panel instead of a sidebar that grows with the conversation and scrolls off the page. When the height chain is unresolved, a one-time console warning explains the proper fix. Advanced layouts can override the cap with any CSS length or disable the guard entirely with `dock.maxHeight: false`.
- 287f675: Built-in `suggest_replies` client tool behind `features.suggestReplies.expose`. When exposed, the widget advertises the tool on every dispatch via `clientTools[]`; when the agent calls it, the widget renders the suggestions as tappable quick-reply chips above the composer (reusing the suggestion-chips surface and `suggestionChipsConfig` styling) and immediately auto-resumes the execution: fire-and-forget, no user input awaited. Tapping a chip sends its text verbatim as the user's next message; chips clear once any user message follows them. Exports `SUGGEST_REPLIES_CLIENT_TOOL`, `SUGGEST_REPLIES_PARAMETERS_SCHEMA`, `SUGGEST_REPLIES_TOOL_NAME`, `parseSuggestRepliesPayload`, and `latestAgentSuggestions` for integrators who declare the tool server-side. New DOM events: `persona:suggestReplies:shown` / `persona:suggestReplies:selected`.

### Patch Changes

- c5eb722: Theme-editor WebMCP tool results (set_brand_colors, get_theme_overview, etc.) now serialize compact JSON instead of 2-space pretty-print: the text block is consumed by the model, where indentation whitespace is pure token overhead. `structuredContent` is unchanged.
- 1aeba66: Theme-editor WebMCP `ToolResult` now accepts MCP image content blocks (`ToolImageContent`), so host-registered tools (like the Theme Editor's `screenshot_preview`) can return rendered screenshots to the agent alongside text. Backwards-compatible: existing text-only results are unchanged.
- 1aeba66: `controller.update()` now refreshes the widget in place when only display config changed (theme, copy, layout, suggestions, …) instead of always recreating the client. Connection/request-shaping changes (apiUrl, clientToken, webmcp, headers, parser, …) still trigger a full client rebuild. This keeps a live stream, and any in-flight WebMCP tool resolve, alive across a mid-turn UI update, so a `webmcp:*` tool that restyles the widget while the agent's turn is still streaming no longer aborts and strands that turn.

## 3.31.1

### Patch Changes

- 1ca052e: Reduce bundle sizes: stop inlining the full package.json into every bundle (a named JSON import tree-shakes it down to the version field, ~1.4 kB gzip off each bundle), and stop shipping the WebMCP polyfill inside the CDN bundle (~10 kB gzip off index.global.js). The polyfill now builds as a standalone lazy chunk (`dist/webmcp-polyfill.js`) that the IIFE bundle imports on demand, only when `config.webmcp.enabled` is true and the page has no `document.modelContext` yet, from a URL derived from the widget script's own `src`. npm/bundler consumers are unaffected (their bundlers keep resolving the bare dynamic import). Self-hosted deployments that rename `index.global.js` and rely on Persona to install the polyfill should install `@mcp-b/webmcp-polyfill` on the page themselves. Size budgets ratcheted down accordingly (CDN 180→161 kB, ESM 141→140 kB, CJS 142→141 kB) with a new 11 kB budget for the chunk.

## 3.31.0

### Minor Changes

- abf25b2: Render agent-supplied approval reasons. When an `agent_approval_start` or `step_await` (approval) event carries the new `reason` field, the approval bubble shows an attributed "Agent's stated reason" line between the summary and the technical details. The reason is rendered as plain text (never markdown/HTML) and is explicitly attributed to the agent, since it is the agent's own claim about its intent. New `AgentWidgetApprovalConfig` options: `reasonColor`, `reasonLabel`; `formatDescription` now also receives `reason`.
- 2afdde1: Smarter scrolling during streamed responses:

  - **Content-growth follow**: the transcript now stays pinned to the bottom when content grows without a render event: images and embeds finishing loading mid-stream, web fonts swapping, or the panel/composer resizing.
  - **New scroll modes** via `features.scrollBehavior.mode`: `"follow"` (default, current behavior), `"anchor-top"` (on send, the user's message is pinned near the top of the viewport and the response streams in below it: no auto-scroll while reading), and `"none"`. `anchorTopOffset` tunes the anchored gap.
  - **Selection-aware streaming**: auto-follow pauses while text is being selected in the transcript, so streaming no longer drags a selection out from under the cursor.
  - **Scroll-on-send**: sending a message always returns the view to the latest content, even after scrolling up.
  - **New-message badge**: the scroll-to-bottom affordance shows a count of messages that arrived while scrolled away (themeable via `--persona-scroll-to-bottom-count-bg` / `--persona-scroll-to-bottom-count-fg`).
  - The transcript reserves its scrollbar gutter, eliminating the horizontal layout shift when the scrollbar first appears.

### Patch Changes

- 0fb263a: Preserve approval context (tool name, description, tool type, agent-stated reason, parameters) when `agent_approval_complete` resolves an approval bubble. The complete event only carries the decision, so the session now merges it field-wise into the existing approval instead of replacing it: resolved bubbles no longer lose their context on a full re-render.
- a08cb62: Fix outdated theming guidance in the README: all `theme` examples now use the v2 token tree (`semantic.colors.*`) instead of the removed flat v1 shape, the config reference no longer claims flat themes are migrated at runtime, the `copy` option row lists all current keys, and the Theme Configurator link points at this repository.
- c1e7d0d: Restructure the README into a concise landing page (install, quick start, initialization options, proxy setup) with the full reference split into `docs/`: Programmatic Control & Events, UI Features & Components, Script Tag Installation & Framework Integration, Configuration Reference, and Stream Parser Configuration. No content was removed.

## 3.30.0

### Minor Changes

- 4de55e4: Make tool approval bubbles user-friendly by default. The agent-facing tool description and raw parameters JSON are now collapsed behind a "Show details" toggle, and the bubble leads with a humanized summary line ("The assistant wants to use “Add to cart”."). WebMCP tools that declare a display name via the spec's `ToolDescriptor.title` get that label instead, and custom `webmcp.onConfirm` handlers receive it as `info.title`. New `approval` config options: `detailsDisplay` (`"collapsed"` | `"expanded"` | `"hidden"`), `formatDescription` for custom summary copy (receives `displayTitle`), and `showDetailsLabel`/`hideDetailsLabel`.
- d73082a: Unify box-shadow theming across the launcher, approval bubble, and tool-call bubble so every `config.*.shadow` override works the same way: set it globally via the component's theme token (`components.launcher.shadow`, `components.approval.requested.shadow`, `components.toolBubble.shadow`) or the matching CSS variable (`--persona-launcher-shadow`, `--persona-approval-shadow`, `--persona-tool-bubble-shadow`), or per-widget via `config.launcher.shadow` / `config.approval.shadow` / `config.toolCall.shadow` (pass `"none"` to remove the shadow). New: the approval bubble's shadow is now themeable, and `config.toolCall.shadow` is applied directly to the bubble (it previously rewrote the root CSS variable).

  The theme editor (`@runtypelabs/persona/theme-editor`) gains a "Component Shadows" section with controls for the user/assistant message bubbles, tool-call bubble, reasoning bubble, approval bubble, intro card, and composer, so every themeable component shadow is now adjustable in the editor.

- abc624b: Add `approve` / `deny` callbacks to the `renderApproval` plugin hook so a fully custom approval renderer can resolve the approval (previously only the built-in bubble's buttons could). Both route through the same path as the built-in buttons (optimistic update, `onDecision`, in-place anchoring, WebMCP gate handling).

  Each callback accepts an optional `{ remember?: boolean }`, for "Always allow"-style affordances, that is forwarded to `config.approval.onDecision` (now `(data, decision, options?)`) and to the controller's `resolveApproval(approvalId, decision, options?)`. The current approval resolves identically whether or not `remember` is set; the flag lets integrators persist a don't-ask-again policy for future approvals. Exposes the new `AgentWidgetApprovalDecisionOptions` type.

  Also fixes `renderApproval` plugin elements losing their event listeners on transcript re-renders. Custom approval bubbles are now mounted via the same stub-and-hydrate path as `renderAskUserQuestion` and component directives (the transcript morph imports nodes via `document.importNode`, which strips listeners), so interactive custom UI, Approve/Deny buttons, an expandable parameters accordion, etc., stays interactive. Interactive state is preserved across re-renders while the approval is pending and rebuilt when its status changes.

- abc624b: Add `@runtypelabs/persona/plugin-kit`: an optional, dependency-free subpath of utilities for authoring plugins:

  - `injectStyles(target, id, css)`: Shadow-DOM-safe `<style>` injection. Resolves the correct root (the widget's shadow root when shadowed, the document head otherwise), is idempotent across re-renders, and defers correctly when called on an element that mounts after the call. A plain `document.head` `<style>` does not reach elements rendered inside the widget's shadow root; this does. `getStyleRoot(node)` is exported for direct use.
  - `createPopover({ anchor, content, ... })`: a floating popover for dropdowns/menus/tooltips: `fixed`-positioned so it overlays the widget and escapes the transcript's scroll clipping, portaled into the anchor's root (shadow-aware), dismissed on outside pointerdown, repositioned on scroll/resize, and auto-closed when the anchor leaves the DOM. Returns a handle with `open`/`close`/`toggle`/`reposition`/`destroy`.
  - `isEditableEventTarget(event)`: composed-path check so keyboard shortcuts don't fire while the user types in the composer (works across the shadow boundary).

  The bundle is unaffected unless you import the subpath. Both example plugins now consume the kit as worked references: `approval-actions-plugin` (all three helpers) and `ask-horizontal-pills-plugin` (`injectStyles`), which also closes a latent Shadow-DOM styling gap where their `document.head` `<style>` would not reach elements rendered inside the widget's shadow root.

### Patch Changes

- a71fdfb: Add an "Approval request" preview transcript preset (`approval-request`) to the theme editor, so a pending approval bubble (with parameters and Approve/Deny buttons) can be injected to test approval theming. The injected message uses the `approval-<id>` id convention so the Approve/Deny buttons transition the bubble to its approved/denied state in previews that resolve decisions locally.
- 856ec93: Fix `resolveApproval` re-stamping an approval bubble's `createdAt`/`sequence` to "now" on decision, which could reorder it after messages created later (e.g. a long-pending approval resolved after more conversation, or restored/replayed transcripts). The resolved bubble now stays anchored at the point the agent paused for permission, matching the standard human-in-the-loop convention of updating the approval in place.

## 3.29.1

### Patch Changes

- 6a9d540: Preserve in-flight and locally-completed WebMCP tool state when stale await events are re-emitted.
- 5d88959: Measure WebMCP tool bubbles through browser-side async execution instead of completing them at the local-tool pause.

## 3.29.0

### Minor Changes

- eec4603: `generateCodeSnippet` now accepts an optional `target` (CSS selector) in `CodeGeneratorOptions` to control the widget mount point. When omitted it defaults to `body` (unchanged behavior). When provided, ESM / React / manual / advanced formats emit it as the `initAgentWidget({ target })` argument, and `script-installer` serializes it into `data-config` (the installer reads `config.target`). This lets snippet-generating tools (e.g. the Runtype CLI's `persona init --target`) mount into a specific element while still routing through the single `generateCodeSnippet` source of truth.

## 3.28.0

### Minor Changes

- fcd9a61: Add a server/Worker-safe `@runtypelabs/persona/codegen` subpath export that exposes `generateCodeSnippet` (and its `CodeFormat` / `CodeGeneratorHooks` / `CodeGeneratorOptions` types) without pulling in the browser widget runtime. Snippet generation is pure string-templating, so consumers that only need to emit embed code (server-side renderers, Cloudflare Workers, CLIs) can import it without dragging in idiomorph/marked/DOM code. The main barrel export is unchanged.

## 3.27.0

### Minor Changes

- 10f47bd: Faster script-tag installs: the launcher now loads from a standalone ~14 KB brotli `launcher.global.js` critical bundle (vs ~134 KB for the full `index.global.js`), and the heavy conversation panel is deferred until the launcher is first clicked.

  The installer (`install.global.js`) automatically takes this path for the common floating-launcher case and renders the real launcher: full theme and Lucide icon fidelity, no placeholder or flash. On first click it loads the full widget and opens the panel via the existing controller API, then removes the critical launcher. Any configuration that starts open or renders differently eager-loads the full bundle exactly as before : inline embeds, docked / composer-bar modes, `launcher.autoExpand`, a persisted "was open" state restored on reload, and `onStateLoaded` hooks : as do custom `jsUrl` overrides that don't mirror the published `dist` layout. Also adds a public `window.AgentWidgetLauncher.mount()` API for advanced/standalone use.

  Clearer install lifecycle hooks, so deferral never makes a "loaded" handler fire at the wrong time: `onScriptLoad` (the embed script executed), `onLauncherShown` (the launcher painted on the page: page-load time, for "widget appeared" analytics), `onChatReady` (the full widget is initialized and its controller API is callable : after first open in deferred installs), and `onError` (a load step failed, so ad-blocked / timed-out installs no longer fail silently). Matching DOM events are dispatched too: `persona:script-load`, `persona:launcher-shown`, `persona:chat-ready`, `persona:error`. `onReady` is **deprecated** in favor of `onChatReady`: it keeps working as an alias (and still dispatches `persona:ready`) but logs a one-time console warning and will be removed in the next major. The same `onReady` → `onChatReady` rename applies to the programmatic `initAgentWidget({ … })` option.

### Patch Changes

- 6e89c8a: Seed Persona's Runtype SSE contract from Core's public OpenAPI spec and generate public Runtype stream/client-token types from the checked-in snapshot.

## 3.26.0

### Patch Changes

- 8909069: Suppress whitespace-only assistant bubbles emitted before leading tool calls.

## 3.25.0

### Minor Changes

- 00b0787: Trim the CDN/IIFE bundle by excluding dev-only helpers.

  The dev/demo-only helpers `generateCodeSnippet` and `createDemoCarousel` are no longer bundled into the IIFE/CDN build (`index.global.js`), making it smaller. A running widget never needs them: they are build-time / config-tool utilities. The barrel was split into `index-core.ts` (shared API, used by the IIFE) and `index.ts` (npm entry, which re-adds the two helpers).

  This change is invisible to a running widget: no styling, behavior, or functional change.

  - **npm consumers:** no change: `generateCodeSnippet` and `createDemoCarousel` are still exported from `@runtypelabs/persona`.
  - **Script-tag / CDN consumers:** `window.AgentWidget.generateCodeSnippet` and `window.AgentWidget.createDemoCarousel` are no longer exposed on the global. These are dev-only tools never used by a live widget.

## 3.24.0

### Minor Changes

- 5f8e74c: Diff-only / send-once WebMCP `clientTools[]` dispatch for client-token conversations. After the first turn, the widget sends only a `clientToolsFingerprint` when the page's tool registry is unchanged, omitting the full array; it resends the full list on a change, on a fresh session, on `clearMessages()`, or when the server replies `409 client_tools_resend_required` (retried exactly once). The proxy/flow and agent dispatch paths, and the API-key `/v1/dispatch` path, are unchanged and continue to send the full list every turn. Requires the matching core `/v1/client/chat` server support to take effect; older servers simply receive the full list as before.

## 3.23.0

### Minor Changes

- 67ddea7: Add an output throughput (tok/s) metric to the Events diagnostics screen. Throughput is derived passively from the existing SSE event stream: estimated live from visible text deltas and finalized from exact provider usage on terminal `flow_complete` / `agent_complete` events , and shown as a compact "Output throughput" summary row: the tok/s value is the headline, with the supporting breakdown (output tokens, duration, and source : usage vs estimate) revealed on hover.

### Patch Changes

- 377fd22: Minify the subpath build outputs (`theme-editor`, `smart-dom-reader`, `testing`, `animations/*`), which were previously shipped unminified. This cuts `theme-editor.js` from ~1,020 kB to ~538 kB raw (200.8 kB → 143.0 kB gzip) and `smart-dom-reader.js` from ~73 kB to ~37 kB raw, with no API or behavior change.

## 3.22.0

### Minor Changes

- d3db148: Improve the dispatch-failure fallback message and make it configurable. Replaces the misleading "proxy isn't returning a real response yet" copy with an honest message that explains the chat service couldn't be reached and surfaces the underlying error reason. Adds a new `errorMessage` config option (a static string or `(error) => string`) to override the copy; returning an empty string suppresses the fallback bubble while still firing `onError`.

  Also fixes abort handling on `continueConversation`: a cancelled continuation (e.g. a superseded in-flight stream) no longer shows the dispatch-error bubble or fires `onError`, matching `sendMessage`'s behavior: only genuine failures surface.

- 130513f: Composer keyboard UX improvements:

  - **Enter no longer stops a streaming response.** Pressing Enter while a response streams is now inert (it never aborts generation). Use the visible Stop button or press Escape to stop.
  - **Escape stops streaming.** While a response streams, pressing Escape within the widget aborts it (scoped to the widget; the composer-bar Escape-to-collapse behavior still applies when not streaming).
  - **Up/Down arrows navigate message history.** In the composer, Up recalls previously sent user messages for quick re-entry or editing and Down walks back toward the in-progress draft (shell / Slack style). History is only entered when the caret is at the start of the input, preserving normal multi-line cursor movement. Disable via `features.composerHistory: false`.

- eb7f3e1: Export the action-system types from the package root: `AgentWidgetActionHandler`,
  `AgentWidgetActionHandlerResult`, `AgentWidgetActionParser`, `AgentWidgetParsedAction`,
  `AgentWidgetActionContext`, and `AgentWidgetActionEventPayload`. These back the public
  `actionHandlers` / `actionParsers` config options but were previously unexported, so
  consumers authoring custom action handlers or parsers could not type them by name.
- eb7f3e1: Add an optional `@runtypelabs/persona/smart-dom-reader` entry point for richer host-page
  DOM parsing. It exposes `createSmartDomReaderContextProvider()` (drop into
  `config.contextProviders`), `collectSmartDomContext()`, and the pure mapper
  `smartDomResultToEnriched()`, adding Shadow-DOM piercing, form grouping, and page
  landmarks/state over the default `collectEnrichedPageContext` reader. Both the collector
  and provider accept a `root` element to scope extraction to a subtree (parity with the
  default reader's `root`). The backing
  library (`@mcp-b/smart-dom-reader`, MIT) is vendored and bundled only into this opt-in
  entry, so the main bundle and IIFE/CDN build are unaffected. Also re-exports the
  `AgentWidgetContextProvider` / `AgentWidgetContextProviderContext` types from the public API.
- e9103cb: Add WebMCP tools for the theme editor. `@runtypelabs/persona/theme-editor` now exports `createThemeEditorTools(state)`, a transport-agnostic factory that returns intent-level WebMCP tools (set brand colors, assign color roles, set typography/roundness/color-scheme, apply presets, configure the widget, check WCAG contrast, plus a low-level field escape hatch and session/export controls). Wiring the tools to a `ThemeEditorState` lets a browser agent configure a theme: including a Persona widget styling itself.
- 87c18d8: WebMCP: complete the local-tool `/resume` round-trip in client-token mode. `resumeFlow` now posts to `POST /v1/client/resume` (the session-authenticated route from runtypelabs/core#3889) with the active `sessionId` in the body and no Bearer key when the widget runs in client-token mode; dispatch/proxy mode is unchanged (`${apiUrl}/resume`). Previously a client-token (browser) page could register and dispatch WebMCP tools but had no endpoint to post tool outputs back, so paused local-tool turns hung unless routed through a proxy.
- c4cd7a6: Add WebMCP consumption. Persona now snapshots page-registered tools per turn via `@mcp-b/webmcp-polyfill`, ships them on `dispatch.clientTools[]`, and executes returned `webmcp:*` tool calls with confirm-by-default gating.

  Opt in via `config.webmcp = { enabled: true }`. When enabled, the widget lazily installs the polyfill, reads `document.modelContext.getTools()` before each dispatch, and routes any `webmcp:*` tool call returned by the agent through the bridge: confirming with the user, executing the page tool via `document.modelContext.executeTool()` with a 30s timeout, normalizing the return into MCP `{ content: [...] }` shape, and posting to `/v1/dispatch/resume`. Wire a custom confirm UI through `config.webmcp.onConfirm`; the default falls back to `window.confirm()`.

  The polyfill is loaded only when WebMCP is enabled, so widgets that don't opt in never install `document.modelContext`. Consumption also works on browsers that ship WebMCP natively.

  When a single turn produces multiple `webmcp:*` tool awaits, each resolve now uses its own per-call `AbortController` (tracked for teardown by `cancel()`/`clearMessages()`/`hydrateMessages()`/`sendMessage()`), so resolving one local tool no longer aborts the in-flight resume stream that delivers the next: fixing a hang on chained/parallel local tool calls.

- 87c18d8: WebMCP tool-call confirmations now render through Persona's native in-panel approval bubble by default (the same chrome used for server-driven tool approvals), instead of the blunt `window.confirm` fallback. A new `webmcp.autoApprove(info)` predicate lets you skip the gate for specific tools (e.g. auto-allow a read-only catalog search while still confirming mutating calls). Supplying `webmcp.onConfirm` continues to fully override the UI.
- 87c18d8: WebMCP: support parallel local-tool calls. When one model turn makes several `step_await(local_tool_required)` calls for a single paused execution: including two PARALLEL calls to the **same** tool (e.g. "add SHOE-001 and SHOE-007 to my cart") : the widget now executes each page tool concurrently (each gated by its own native approval bubble) and posts a **single** `/resume` whose `toolOutputs` are keyed by the per-call `toolCallId` (runtypelabs/core#3878) instead of one resume per tool keyed by tool name. Same-tool parallel calls previously collided on the name key and raced on `/resume`, hanging the turn after the first tool. Single-call and distinct-tool turns are unchanged (name-keying remains the fallback for servers that don't emit `toolCallId`).

### Patch Changes

- f58cba9: Fix reasoning ("thinking") text freezing mid-stream once the accordion is opened. On the sequenced streaming path the client collapses `reasoning.chunks` to a single accumulated string, so `chunks.length` stays 1 and the content-blind reasoning fingerprint never changed: leaving the render cache stuck on a stale bubble. The fingerprint now also hashes the last reasoning chunk's length and trailing 32 characters (mirroring the tool-call treatment), so the cache invalidates on every reasoning delta and the bubble streams live.
- 17314db: Fix theme editor `set_brand_colors` (and contrast checks) corrupting palettes when given `rgb()`/`rgba()` color input. `hexToHsl` and `wcagContrastRatio` now parse rgb strings instead of producing `#NaNNaNNaN` shades. Adds an `rgbToHex` color utility.
- 52e3047: Refresh the client session before resuming a paused flow in client-token mode. A WebMCP local-tool approval can sit awaiting user input long enough for the session to expire; `resumeFlow` now awaits `initSession()` (which returns the live session while valid, else re-inits) and threads the refreshed `sessionId` to `POST /v1/client/resume`, instead of trusting a possibly-stale cached session.

## 3.21.3

### Patch Changes

- 2b0cd1d: Fix the composer send button rendering two stacked icons (e.g. a doubled send arrow) after the first send→stop→send cycle. `setMode` swapped the icon via `replaceChild(next, prev)` against a captured `prev` node reference; when an external re-render/morph (such as a host calling `controller.update()`) replaced the live icon child with a clone, that reference was detached and the `appendChild` fallback left both icons mounted. `setMode` now uses `replaceChildren(next)`, so the button always holds exactly one icon regardless of any intervening DOM morph.

## 3.21.2

### Patch Changes

- 1931845: Fix agent-turn text/tool interleaving so a `text → tool → text → tool → text` sequence within a single `agent_turn` renders as separate, chronologically ordered bubbles instead of one merged text bubble below all the tool cards.

  Previously, all `agent_turn_delta` (text) events within a turn accumulated into a single `assistantMessage` that was only finalized at iteration/step boundaries. Because each `agent_tool_start` created a tool message with an earlier `createdAt` than the still-growing text message, the timeline sorted tools before the consolidated narration, so an assistant that said _"Let me scrape a few more pages"_ before kicking off a Firecrawl tool would appear to "explain itself" below the tool card it triggered.

  The widget now seals the in-flight assistant text bubble at every `agent_tool_start`, so the next text delta in that turn creates a new bubble. `agent_turn_complete.stopReason` continues to attach to the final visible text segment (whether it was sealed by a tool boundary or by turn-complete itself).

  No wire-protocol changes; relies on existing `seq`-ordered events and treats `agent_tool_start` as the natural segment boundary.

## 3.21.1

### Patch Changes

- dcb2c8a: Show the typing indicator immediately after answering an `ask_user_question` (and after approving/denying a tool), so the gap between the user's click and the next streamed token no longer feels broken.

## 3.21.0

### Minor Changes

- ff0e4ab: Handle the new `agent_media` SSE event so tool-produced media (images, audio, video, files) renders inline in the chat at the point the tool completed. Wire format follows the AI SDK v3/v4/v6 `MediaContentPart` shape (`{ type: 'media' | 'image-url' | 'file-url' }`); `mediaType` drives routing to the right rendering bucket. Adds `AudioContentPart` and `VideoContentPart` to the public types and renders `<audio>`/`<video>` controls plus file download links in message bubbles.

## 3.20.0

### Minor Changes

- 3d92122: Make injecting component directives a first-class API.

  - `InjectMessageOptions` now accepts an optional `rawContent` field, and `injectMessage` / `injectAssistantMessage` / `injectUserMessage` / `injectSystemMessage` / `injectMessageBatch` forward it onto the resulting message. This unblocks rendering streamed-style directives (e.g. `{ "text": "...", "component": "Foo", "props": {...} }`) without falling back to the deprecated `injectTestMessage` event envelope.
  - New `injectComponentDirective({ component, props, text?, llmContent?, id?, createdAt?, sequence? })` convenience method on the session and controller. Builds the canonical directive JSON, sets `content` to `text`, `rawContent` to the directive, and forwards `llmContent` so the LLM can see a redacted version on subsequent turns.
  - `hasComponentDirective` and `extractComponentDirectiveFromMessage` now fall back to `content` when `rawContent` is missing and `content` looks like JSON, so messages injected via `content` alone still render as components. `rawContent` is still preferred when both are present.

## 3.19.0

### Minor Changes

- 2eba114: ## `@runtypelabs/persona`

  ### `launcher.mountMode: "composer-bar"`: persistent pill composer

  Add `launcher.mountMode: "composer-bar"`: a sleek rounded-pill composer fixed at the bottom of the viewport that morphs into an expanded chat panel on submit and minimizes back. Single composer DOM instance, so messages, drafts, and attachments persist across collapse/expand. The collapsed pill is single-row (paperclip · textarea · mic · send) with no surrounding card chrome; suggestions and status indicator stay hidden until expanded.

  Configurable via `launcher.composerBar`:

  - `expandedSize`: `"anchored"` (default: pill stays put, panel grows upward into a centered column above it) | `"fullscreen"` (edge-to-edge viewport) | `"modal"` (centered sheet)
  - `expandedMaxWidth` (default `"880px"`) and `expandedTopOffset` (default `"5vh"`): anchored panel sizing
  - `contentMaxWidth` (default `"720px"`): auto-centers messages, composer, suggestions, and previews horizontally inside the expanded panel; falls back to `layout.contentMaxWidth` when set
  - `collapsedMaxWidth` (no default: when omitted, the pill uses the responsive defaults `90vw` / `70vw` / `50vw` at `<640` / `<1024` / `>=1024` viewports; setting it overrides with a fixed pill width) and `bottomOffset` (default `"16px"`) : pill sizing/position
  - `expandOnSubmit` (default `true`), `modalMaxWidth`, `modalMaxHeight`

  Internally, composer-bar mode uses a purpose-built pill composer (`pill-composer-builder.ts`) that shares low-level button factories with the regular composer (`composer-parts.ts`): the only meaningful difference is the layout shell + className. Plugin-rendered headers and composers continue to work unchanged; stable data-attribute selectors (`data-persona-composer-form`, `-input`, `-submit`, `-mic`, `-status`) are preserved across both composer variants.

  The expanded chat panel is purpose-built for this UX: a minimal corner-only header (no title bar, subtitle, or refresh button strip) with two small action icons stacked in the top-right, a clear/start-over button and the × close button, and the pill stays mounted as a viewport-fixed sibling of the chat panel chrome (always visible and interactive, never absorbed into the panel above). Clicks anywhere outside the wrapper or pill collapse back to just the pill. Both action buttons flow through the existing `launcher.closeButton*` and `launcher.clearChat.*` config (tooltip, icon, color, size) via shared `createCloseButton` and `createClearChatButton` factories in `header-parts.ts`. Set `launcher.clearChat: { enabled: false }` to render only the × close icon. Composer-bar mode sizes both icons at 16px (versus the floating launcher's 32px default) to read as a paired action group rather than a header strip.

  The pill (and peek banner) live in a viewport-fixed `pillRoot` element that is a sibling of the wrapper inside the host mount node: not a descendant. This decouples the pill from the wrapper's geometry transitions: in `expandedSize: "modal"` the wrapper's `transform: translate(-50%, -50%)` no longer drags the pill toward the centered modal, and in `expandedSize: "fullscreen"` the pill stays anchored at the viewport bottom while the chat panel covers the rest of the screen. The pillRoot mirrors the wrapper's `data-state` and `data-expanded-size` attributes so peek visibility rules cascade unchanged. Pill width is set on the pillRoot itself via the same responsive `90vw / 70vw / 50vw` media-query defaults (overridable with `composerBar.collapsedMaxWidth`); pill bottom offset honors `composerBar.bottomOffset` (default `16px`). In `expandedSize: "anchored"`, the wrapper's bottom edge clears the pill area via `calc(${bottomOffset} + var(--persona-pill-area-height, 80px))` : override the CSS variable on the host if the static 80px clearance leaves a visible overlap with custom pill content.

  In `expandedSize: "fullscreen"`, the chat panel covers the entire viewport and messages scroll behind the pill rather than stopping above it. The body's bottom padding is removed in this mode (so the body background extends to the viewport edge) and the messages list gains `padding-bottom: calc(${bottomOffset} + var(--persona-pill-area-height) + 16px)` so the last bubble is reachable above the pill rather than permanently obscured. Override `--persona-pill-area-height` on the host to tune the reachability gap if you've themed the pill to a non-default height.

  Pressing Escape while the chat is expanded collapses back to just the pill: same end state as outside-click. Matches the WAI-ARIA dialog pattern (modal mode is literally a dialog) and the dominant chat-widget convention (Intercom, Drift, Crisp). The handler attaches on expand and detaches on collapse, so it doesn't intercept Escape outside the chat session. Guarded on `event.isComposing` so dismissing an IME suggestion (Pinyin, Kotoeri, etc.) doesn't also collapse the panel.

  In `expandedSize: "modal"` and `expandedSize: "anchored"`, the wrapper's geometry transition is disabled so the panel snaps to its expanded position rather than sliding in directionally. (The wrapper goes from collapsed, no inline `top/left/transform`, to its expanded position, and the default `transform 220ms ease` would interpolate `none → translate(...)`, reading as a slide-in from the wrapper's static-default origin: diagonally from the bottom-right for modal, horizontally from the right for anchored. With pillRoot owning the visible chrome in the collapsed state, the wrapper has nothing to morph from, so the slide is pure motion noise. The container's existing opacity fade-in keyframe is enough of a reveal. Fullscreen keeps its geometry transition because that's the one mode where the wrapper genuinely morphs from empty to full viewport, and the staggered fade-in cascade is built specifically to mask the outer-edge/inner-content desync during that morph.)

  The collapsed pill includes a "peek" affordance for re-entering chat history: a chrome-less row above the pill that shows a chat-bubble icon, a trailing-100-character preview of the most recent assistant message, and a chevron-up. The peek fades in while a response is streaming OR when the user hovers the composer area, and fades out otherwise. Clicking the peek expands the panel. This replaces the earlier pill-internal chat-bubble button + focus-to-open behavior, which read as composer chrome rather than as navigation.

  The peek banner shares the same animation surface as the main message stream. Configure once via `features.streamAnimation` and both surfaces inherit (matching `type`, `speed`, `duration`, `buffer`, `placeholder`, and custom plugins). To animate the peek differently, e.g. faster cadence in the ticker than in the bubble, set `launcher.composerBar.peek.streamAnimation` with the same `AgentWidgetStreamAnimationFeature` shape. Carve-out: `bubbleClass` is ignored on the peek (no bubble analog); `containerClass`, `wrap` (`"char"`/`"word"`), `useCaret`, the `"skeleton"` placeholder (used when `buffer: "line"` trims to empty between line completions), and `onAfterRender` plugin hooks all port over. Per-char/per-word span IDs are namespaced with a `peek-` prefix so they don't collide with the main bubble's spans for the same message id, and use absolute char indices so animations on already-revealed chars survive each chunk's slice shift.

  ### Icon registry: explicit named imports + public `renderLucideIcon` export

  Two changes that ship together:

  1. **Public `renderLucideIcon` (and `IconName` type) export.** The widget already used this helper internally for every icon in its chrome (header, composer, launcher, tool/reasoning bubbles, attachment manager, etc.); exposing it lets custom `ComponentRenderer` authors draw the same icons without re-implementing inline SVG.

     ```ts
     import { renderLucideIcon, type IconName } from "@runtypelabs/persona";

     const clock = renderLucideIcon("clock", 14, "currentColor");
     if (clock) container.appendChild(clock);
     ```

  2. **Closed icon registry: drops ~400KB from the IIFE bundle.** The previous implementation was `import * as icons from "lucide"` plus a runtime string lookup, which defeated tree-shaking; the script-tag/CDN distribution (`dist/index.global.js`) shipped all 1640 lucide icons. The registry is now a curated set of ~110 named imports covering the widget's internal usage and common UI patterns (forms, status, navigation, commerce, media, files, social, decorative). Names outside the registry return `null` and log a warning. See `packages/widget/docs/icon-registry-shortlist.md` for the full list and the rule for adding more.

  **Behavior note for config consumers:** any place where you previously passed an arbitrary lucide icon name string (e.g. `launcher.callToActionIconName`, `sendButton.iconName`, `voiceRecognition.iconName`) now resolves against the closed registry. The default values are unchanged. If you were passing a custom name that isn't on the shortlist, the icon will silently render as null and you'll see a console warning telling you to add it to the registry. The new `IconName` type gives TypeScript users autocomplete and compile-time errors for unknown names.

  **Side fix:** `attachment-manager.ts` previously returned `"file-json"` as the icon name for `application/json` attachments: that name doesn't exist in lucide v0.552 and silently failed. Switched to `"file-code"`.

  ### Component directives: preserve event listeners across morph passes

  Event listeners on custom component renderers (registered via `config.components` and rendered from JSON directives) are preserved across transcript updates. Previously, serializing through `tempContainer.innerHTML` during the morph pass dropped `addEventListener`-attached listeners (e.g. `DynamicForm` submit handlers calling `preventDefault()` could revert to full-page navigation after later messages). Directive bubbles now use stub-and-hydrate like `renderAskUserQuestion`; fingerprint-gated rebuilds avoid wiping mid-stream form input when other messages re-render.

  ### `persistState: false` is now an explicit storage kill-switch

  Make `persistState: false` an explicit kill-switch for chat-history persistence. Previously, setting `persistState: false` only suppressed UI state (open/closed, voice mode, focus): message history was still written to the default `localStorage["persona-state"]` adapter. Now `persistState: false` also short-circuits the storage adapter: the default localStorage adapter is never created, and any user-supplied `storageAdapter` is ignored. This is the strict semantic : passing `persistState: false` means "no chat history is read or written, period." Pass `persistState: true` (or omit it) to keep the prior behavior of persisting messages via the configured `storageAdapter` (or the built-in localStorage adapter).

  Why this matters: multiple widgets on the same origin (e.g. several demos served from `localhost:5173`) used to share a single `localStorage` key by default, so injecting a tool call or message in one demo would leak into the next. Setting `persistState: false` now prevents that leakage; for cases that _want_ persistence, pass an explicit `storageAdapter: createLocalStorageAdapter("my-unique-key")`.

  ## `@runtypelabs/persona-proxy`

  ### `STOREFRONT_ASSISTANT_FLOW`

  Add `STOREFRONT_ASSISTANT_FLOW` for product-discovery demos. The flow emits three JSON actions:

  - `{"action": "show_products", "text": "...", "products": [{"id", "title", "price", "image", "description"}]}`: the host page renders these as a product card grid alongside the chat.
  - `{"action": "add_to_cart", "text": "...", "item": {"id", "title", "price"}}`: the host adds the item to its cart.
  - `{"action": "message", "text": "..."}`: plain conversational reply that stays in the chat panel.

  Wired into `examples/persistent-composer.html` as the "Everspun" storefront demo, where asking the agent for products dynamically populates a host-page product grid below the existing hero.

  ### Scheduling flow: half-width form fields

  Teach `DynamicForm` prompts about `width: "half"` so the AI can pair short related inputs (e.g. Phone + Company, City + Zip) side-by-side instead of stacking every field full-width.

## 3.18.0

### Minor Changes

- 7e58039: **`@runtypelabs/persona`**

  - **Human-in-the-loop (`ask_user_question`).** Support Runtype `step_await` (LOCAL tool pause), `client.resumeFlow()`, and `session.resolveAskUserQuestion()`. Synthesize tool messages with `agentMetadata.awaitingLocalTool`, render the answer UI, and resume via `POST` with `toolOutputs` (with `sendMessage` fallback for agents that do not use LOCAL tools). Idempotent `resolveAskUserQuestion` for rapid double-clicks.
  - **Built-in answer UI.** Interactive sheet (stacked rows by default, optional `layout: "pills"`), optional free-text, progressive hydration from streaming tool args, feature flags under `features.askUserQuestion`, and `renderAskUserQuestion` / `parseAskUserQuestionPayload` for custom renderers. Plugins that delegate to the default should return `null` when `message.agentMetadata.askUserQuestionAnswered === true` so the widget owns the answered transcript.
  - **Grouped questions.** Up to 8 questions per call, paginated stepper, `Record<questionText, string | string[]>` result shape, persistence of in-progress state across refresh, labels `nextLabel` / `backLabel` / `submitAllLabel` / `skipLabel`, and optional `groupedAutoAdvance: false`. UX aligned with common AskUserQuestion-style patterns: row layout, skip/back/submit, Q→A pair messages in the transcript, keyboard shortcuts 1–9, compact header, and optional “Other” input behavior per layout.
  - **Fixes.** Composer overlay width and z-index; sheet lifecycle (answered flag, `awaitingLocalTool` gating, prune stale DOM); remove redundant “awaiting” stub when the sheet is the primary UI. Scroll-to-bottom control no longer covers the answer sheet.
  - **Artifacts.** Persist artifact list and selection in `storageAdapter`; `initialArtifacts` / `initialSelectedArtifactId`, `hydrateArtifacts()`, and controller helpers for custom chrome; completed-only persistence for artifacts. Backward compatible with older stored state.
  - **Theming.** `components.introCard` tokens and CSS variables for the welcome / intro card.

  **`@runtypelabs/persona-proxy`**

  - **`POST` resume route** (default under the chat path) forwarding `{ executionId, toolOutputs, streamResponse }` to the upstream `/resume` endpoint for LOCAL tool completion. Pre-configured `RuntypeFlowConfig` examples in this package can declare `ask_user_question` and other `runtimeTools` the same way as any custom flow.

## 3.17.0

### Minor Changes

- 31322f8: Add stop-streaming support: the composer submit button now doubles as a stop button while a response is streaming. Clicking it (or pressing Enter) aborts the in-flight stream via `Session.cancel()` and leaves the textarea contents intact so the user can edit and resend. `Session.cancel()` now also stops in-progress audio playback (Web Speech API and the Runtype voice provider) so "stop" really means "stop", matching ChatGPT / ElevenLabs / Gemini voice UX. Configurable via new `sendButton.stopIconName` (default `"square"`), `sendButton.stopTooltipText` (default `"Stop generating"`), and `copy.stopButtonLabel` (default `"Stop"`) options.
- 54992d0: Surface the runtime's new `stopReason` field on `agent_turn_complete` and `step_complete` SSE events. Assistant messages now carry an optional `stopReason` (`'end_turn' | 'max_tool_calls' | 'length' | 'content_filter' | 'error' | 'unknown'`); when the value is non-natural, the bubble renders a small inline notice instead of leaving an empty space. Notably, when the agent loop trips its tool-call ceiling and emits no follow-up text, the bubble now reads "Stopped after calling a tool. Send a follow-up to continue." rather than rendering an empty bubble. Copy is overridable per-reason via the new `config.copy.stopReasonNotice` option. Older API streams that omit `stopReason` render exactly as before.
- dcccbb4: **Stream animation**: Add `features.streamAnimation` with a pluggable plugin API for how streaming assistant text reveals itself. Built-in animations: `typewriter` (per-char fade + caret), `pop-bubble` (scale + opacity entrance). `letter-rise` and `word-fade` are core built-ins (auto-registered, CSS ships in `widget.css`). `wipe` and `glyph-cycle` stay as subpath plugins (`@runtypelabs/persona/animations/<name>`). Subpath usage: importing an animation module auto-registers it for use in `streamAnimation.type`. Custom animations: `registerStreamAnimationPlugin(plugin)` or `features.streamAnimation.plugins`. `StreamAnimationPlugin` supports `containerClass`, `bubbleClass`, `wrap` (`"char" | "word" | "none"`), `useCaret`, `styles` (injected on activation), `bufferContent`, and `onAttach` for observers/listeners. Buffering: `features.streamAnimation.buffer` (`"word"` | `"line"`) trims accumulated streaming content before rendering. Placeholder: `placeholder: "skeleton"` uses a single full-width shimmer bar instead of typing dots; with `buffer: "line"`, the skeleton trails below already-revealed content until the stream completes. IIFE / script-tag install: the global build auto-registers every built-in animation (e.g. `type: "wipe"` works without extra imports). Re-inject stream-animation plugin styles when a widget is torn down and recreated on the same host (`ensurePluginActive` restores missing `<style>` tags). Stop the scroll-to-bottom button from flashing during stream animations when a shrinking `scrollHeight` clamps `scrollTop` and would be misread as the user scrolling up. Default: `{ type: "none", placeholder: "none", buffer: "none" }` : no change for existing integrations.

  **Testing**: Add `@runtypelabs/persona/testing` subpath exporting `createMockSSEStream`, `createMockSSEResponse`, and `buildAssistantTurnFrames` (plus associated types) for mocking SSE streams in demos, theme editor previews, and tests. Consolidates the previously duplicated helpers from the embedded-app demos.

  **Theme editor**: Add a **Stream Animation** section under Features (type, placeholder, buffer, per-unit duration, container duration), and three new Preview Transcript presets (code block, markdown table, image). Assistant text presets from the Preview Transcript toolbar now stream progressively so Stream Animation controls (`typewriter`, `word-fade`, `letter-rise`, etc.) engage on the preview. Export `presetStreamsText` and `buildTranscriptStreamFrames` from `@runtypelabs/persona/theme-editor` for consumers that want the same streaming playback.

  **Scroll**: Fix `controller.update()` resetting the messages-area scroll to the top: `applyFullHeightStyles` temporarily clears `body.style.cssText`, which briefly collapses the body so `scrollTop` is clamped to 0. The previous scroll position is now captured and restored on the next animation frame after layout reflows, so live `controller.update()` on an open, scrolled widget (theme editors, A/B tests, etc.) no longer jumps the transcript to the start.

## 3.16.0

### Minor Changes

- 317684c: Route nested-flow SSE events (`step_delta` with `toolContext`) into separate assistant bubbles, respect `partId` segmentation for nested prompts, and ignore nested `text_start` / `text_end` on the outer stream. Add optional `parentToolId` and `parentStepId` on message metadata for grouping nested output.

  Improve header close-button visibility and alignment: default `launcher.closeButtonPaddingX` / `closeButtonPaddingY` to `0px`, render the close icon larger to match other header actions, and use consistent flex centering with the clear-chat control.

## 3.15.1

### Patch Changes

- 92f473b: SSE sequence reordering: refactor stream reorder to an event-level `SequenceReorderBuffer`, replacing per-type chunk buffers (`seqChunkBuffers`, `reasonSeqBuffers`, `insertSeqChunk`) with one buffer that reorders all SSE events by `seq` before dispatch: simpler, covers every event type, and avoids the memory-leak class of bugs that motivated follow-up fixes.

  Harden the buffer for edge cases: end-of-stream flush (events waiting on a missing `seq` are no longer dropped when the stream closes; they run through the normal handler before return) and duplicate `seq` handling (earlier event is emitted instead of overwritten, with `console.warn`).

  Repair late-arriving sequenced chunks after reorder-buffer gap flushes so streamed text stays in server order, including `reason_delta` after gap-timeout flush.

  Hoist the `drainReadyQueue` closure out of the per-event loop so it is created once instead of on every SSE event.

  Polish: remove unused `SequenceReorderBuffer.reset()` (and tests), document why both synchronous and microtask drain paths on the dispatch side are intentional, and small cleanups (naming, indentation, unused local).

  Message actions: improve vote button feedback (filled icon with pop on vote, outline on un-vote) and simplify the message actions pill (no border, background, or box-shadow).

## 3.15.0

### Minor Changes

- 5d5b2a3: Add optional `config.onSSEEvent` so hosts can observe every parsed SSE frame (e.g. artifact side effects) without short-circuiting native streaming.

## 3.14.0

### Minor Changes

- 610f4a3: Handle `step_error`, `dispatch_error`, and `flow_error` SSE frames natively: emit `error` events, finalize streaming assistant messages, and transition status to `idle`. Hosts no longer need a custom `parseSSEEvent` callback for these Runtype flow/dispatch error types.

## 3.13.0

### Minor Changes

- 4dca9ca: Add programmatic access to widget handle from the install script via `windowKey`, `onReady` callback, and `persona:ready` custom event. The code generator now supports an optional `windowKey` option for script formats.

## 3.12.0

### Minor Changes

- 51530e5: Add configurable loading animations and text templates for tool call and reasoning bubbles. New `loadingAnimation` display option (`pulse`, `shimmer`, `shimmer-color`, `rainbow`) provides visual feedback during tool execution and reasoning. Text templates (`activeTextTemplate`, `completeTextTemplate`) support `{toolName}` and `{duration}` placeholders with inline formatting syntax (`~dim~`, `*italic*`, `**bold**`). The `renderCollapsedSummary` callback for both tool calls and reasoning now receives `elapsed` and `createElapsedElement()` for custom renderers to display live-updating duration.

### Patch Changes

- acb1669: Fix JSON parse error when `data-config` attribute contains line breaks in HTML
- 4ffd721: Fix tool call bubbles showing fallback "tool" instead of the actual tool name in active text templates. When `agent_tool_start` arrived before `tool_start`, the name-less first render was cached and preserved by the animation morph guard. The fingerprint now includes `toolCall.name` so the cache invalidates when the name arrives, and the morph callback allows content updates when text has meaningfully changed.

## 3.11.0

### Minor Changes

- 8c8a3f3: Add configurable loading animations and text templates for tool call bubbles. New `loadingAnimation` display option (`pulse`, `shimmer`, `shimmer-color`, `rainbow`) provides visual feedback during tool execution. Text templates (`activeTextTemplate`, `completeTextTemplate`) support `{toolName}` and `{duration}` placeholders with inline formatting syntax (`~dim~`, `*italic*`, `**bold**`). The `renderCollapsedSummary` callback now receives `elapsed` and `createElapsedElement()` for custom renderers to display live-updating duration.

### Patch Changes

- aef56bf: Improve transcript auto-scroll reliability during streaming, tool calls, and reasoning updates, including faster catch-up when the view falls behind.

## 3.10.1

### Patch Changes

- b40b9b0: Add drag-and-drop file upload on the chat panel when attachments are enabled, with a subtle drop-target highlight.
- b40b9b0: `createAgentExperience` now throws a clear error when `mount` is null or undefined instead of failing on property access.
- b40b9b0: `renderComposer` `onSubmit` now sends pending attachments (and optional text) the same way as the built-in composer.

## 3.10.0

### Minor Changes

- 41a6a44: Add opt-in collapsed preview, active min-height, configurable summary modes, and grouped sequential rendering for tool call and reasoning bubbles. Collapsed active rows now contribute real height to the transcript scroller, fixing auto-follow when multiple tool/reasoning steps stream in sequence. New SDK hooks (`renderCollapsedSummary`, `renderCollapsedPreview`, `renderGroupedSummary`) and config surfaces (`features.toolCallDisplay`, `features.reasoningDisplay`, `config.reasoning`) let consumers customize collapsed and grouped UX without replacing full bubble renderers. Theme editor gains controls and an interactive preview transcript builder for testing tool/reasoning scenarios. Tool message fingerprints now include chunk count and args length so streaming tool updates invalidate the render cache correctly.
- 3047b63: Add `expandable` option to `toolCallDisplay` and `reasoningDisplay` feature configs. When set to `false`, tool call and reasoning bubbles show only their collapsed summary with no expand/collapse toggle, giving users tool awareness without exposing full details. Also re-render messages when feature display flags change via `controller.update()` so toggling display settings takes effect without a full remount, and fix collapsed preview padding showing on non-active bubbles after expand/collapse.

### Patch Changes

- 4ce5a10: Fix memory leak where reasonSeqBuffers was not cleaned up when reason_delta completed via done:true without a separate reason_complete event.
- ff7c12a: Fix assistant streaming when `text_end` precedes `step_complete`: prevent duplicate bubbles, reconcile the authoritative final response into sealed segments when async parsers lag, and ensure `step_delta` callbacks update the correct message object via closure capture instead of the cleared `assistantMessage` ref.
- 751f97e: Fix streaming UI freezing when SSE events arrive out of order

  `step_delta` and `reason_delta` events can arrive with out-of-order `seq`/`sequenceIndex` values. Previously, text chunks were appended in arrival order, producing garbled content that broke markdown rendering and caused the streaming UI to appear frozen mid-response. Added a sequence-aware reorder buffer that accumulates chunks and rebuilds the full text in correct server-intended order.

## 3.9.2

### Patch Changes

- a83ae8f: Fix tool call activity text rendering each streaming token on its own line
- fa42740: Change default API URL from localhost to production Runtype API (api.runtype.com)

## 3.9.1

### Patch Changes

- 7b0acc7: Fix duplicate assistant message bubbles when `step_complete` follows `text_end`. The `step_complete` handler now skips recreating a message with the full response when `text_end` has already sealed the streamed content, preventing identical text from rendering twice.

## 3.9.0

### Minor Changes

- df61c73: Render assistant text and tool calls in chronological order instead of lumping all text before tools. The widget now handles `text_start`/`text_end` lifecycle events and `partId` on `step_delta` to split assistant messages at tool boundaries, matching the segmentation the Runtype API already emits. Split messages use deterministic IDs derived from the base `assistantMessageId` and `partId` (e.g. `ast_abc_text_1`) for feedback traceability, and `flow_complete` no longer overwrites segment content with the full concatenated response.

### Patch Changes

- 1b46d83: Increase the default floating launcher panel width from 400px to 440px (still `min(..., calc(100vw - 24px))`) so code blocks and structured replies are easier to read, aligned with common chat-widget sizing while leaving room for custom `launcher.width`.

## 3.8.3

### Patch Changes

- 34ab534: Fix model selector not updating agent config: selecting a model in the composer only updated UI state but the next request still used the original model
- 34ab534: Fix suggestion chips not respecting contentMaxWidth: chips were left-aligned while the composer input was centered

## 3.8.2

### Patch Changes

- 5286286: Fixed tool call and reasoning accordions collapsing when new streaming tokens arrive
- 4c89861: Renamed internal `vanilla-*` CSS classes to `persona-*` for consistency

## 3.8.1

### Patch Changes

- 29912e2: Fix clicking an artifact card not reopening the artifact pane after the user dismissed it

## 3.8.0

### Minor Changes

- de5d38a: Add theme tokens for markdown elements, collapsible widget chrome, and message borders: enabling full dark mode styling via config without CSS overrides.

  - Fix inline artifact card background in dark mode (`--persona-surface` instead of nonexistent `--persona-bg`)
  - Add `components.markdown.codeBlock` (background, borderColor, textColor)
  - Add `components.markdown.table` (headerBackground, borderColor)
  - Add `components.markdown.hr` (color)
  - Add `components.markdown.blockquote` (borderColor, background, textColor)
  - Add `components.collapsibleWidget` (container, surface, border) for tool/reasoning/approval bubble chrome
  - Add `components.message.border` for message separator color

- 610a4b1: Raise default widget z-index from 50/9999 to 100000 across all modes (floating
  panel, launcher button, sidebar, mobile fullscreen, docked mobile fullscreen).

  Elevate the host element's stacking context in viewport-covering modes so the
  overlay escapes parent stacking traps.

  Lock document scroll when the widget is open in viewport-covering modes (iOS-safe,
  ref-counted, auto-teardown on destroy).

  Add overscroll-behavior: contain on the messages body.

### Patch Changes

- 915261c: Fix scroll-to-bottom indicator appearing when content fits in view and persisting after clearing chat

  - Hide indicator when message body has no overflow (scrollHeight <= clientHeight)
  - Reset auto-follow state on clear chat so the indicator dismisses immediately

## 3.7.0

### Minor Changes

- 171b086: Add configurable scroll-to-bottom affordances for the chat transcript and event stream, refine the defaults to use an icon-only circular arrow-down control, and expand the shared theme/editor support for size, spacing, and icon sizing.

### Patch Changes

- 7465d86: Fix the transcript scroll-to-bottom affordance so it stays visible above the composer instead of being anchored inside the scrolling message area, including when using custom composer plugins.

## 3.6.0

### Minor Changes

- 5194be0: New input token CSS variables, updated default theme values, and various component styling refinements.

## 3.5.2

### Patch Changes

- becf6db: feat: add partId-based message segmentation for tool call interleaving

  When `partId` is provided in `parseSSEEvent` results and changes between text deltas, the current assistant message is sealed and a new one is created. This produces chronological interleaving of text and tool call bubbles during agent execution. Backward compatible: absent `partId` preserves single-message behavior.

## 3.5.0

### Minor Changes

- 5dc0c0a: Add runtime update support for `statusIndicator.align`, `layout.contentMaxWidth`, and `copy.showWelcomeCard` so these properties update the widget preview dynamically without requiring a rebuild.

  Expand theme reference documentation with `approval`, `textToSpeech`, `messageActions`, `attachments`, `markdown`, and expanded `toolCall` and `layout` entries.

## 3.4.0

### Minor Changes

- 5e76fda: Add `@runtypelabs/persona/theme-reference` entry point with structured v2 theme system documentation, example themes, and `getThemeReference()` for AI/MCP tool consumption. Separate build ensures zero impact on the IIFE widget bundle.

## 3.3.0

### Minor Changes

- b3fc1ef: Add `createDemoCarousel()`: a reusable, exportable component that renders demo pages in scaled iframes with device viewport toggle, zoom controls, light/dark scheme toggle, carousel navigation with dropdown picker, and open-in-new-tab button. Fully self-contained CSS for standalone use on marketing sites.

  Add `statusIndicator.align` option (`'left' | 'center' | 'right'`) to control status text alignment without custom CSS.

  Add `statusIndicator.idleLink` option to make the idle status text a clickable link that opens in a new tab.

  Fix header layout so trailing action buttons (event stream toggle, clear chat, close) are pushed to the right edge instead of clustering after the title.

## 3.2.2

### Patch Changes

- fee9f6d: Align the sidebar's default z-index with mobile fullscreen so overlay modes stay above host-page content by default.

## 3.2.1

### Patch Changes

- a723d8e: Harden the proxy for edge runtimes, reduce sensitive development logging, update Hono dependencies for security fixes, and clean up widget build tooling.

## 3.2.0

### Minor Changes

- a862914: Add `launcher.collapsedMaxWidth` to cap the width of the floating launcher pill when the panel is closed. Launcher title and subtitle use single-line ellipsis truncation with full text in the native `title` tooltip; the text column uses `persona-flex-1 persona-min-w-0` so truncation works inside the flex row. Add `persona-break-words` utility (e.g. for artifact pane monospace lines).

## 3.1.1

### Patch Changes

- 99d688f: Prevent host page paragraph and list styles from overriding message bubble text colors.
- 87a2ef8: `onStateLoaded` can now return `{ state, open: true }` to signal that the widget panel should open after initialization. Useful for post-navigation flows where injecting messages into state should also reveal the panel to the user.

## 3.1.0

### Minor Changes

- 9357fa5: Docked mode: on viewports at or below `launcher.mobileBreakpoint` (default 640), when `launcher.mobileFullscreen` is not `false` and the panel is open, the dock slot switches to `position: fixed` with `inset: 0` and `z-index: 9999` so the assistant paints above host page chrome. Same opt-out as floating mode via `mobileFullscreen: false`. Host layout re-evaluates on window `resize`.
- 9357fa5: Replace shared `#persona-root` id selector with `[data-persona-root]` attribute selector to support multiple widget instances on the same page. The fixed id caused duplicate-id violations and style/selector collisions when mounting more than one widget. All CSS selectors, Tailwind scoping, and DOM traversal now use the attribute-based root marker. Each widget instance gets its own independent root without id conflicts.

## 3.0.0

### Major Changes

- 12364a0: ### Breaking

  - `config.theme` and `config.darkTheme` are typed as `DeepPartial<PersonaTheme>` (semantic token tree: `palette`, `semantic`, `components`). Removed the flat v1 theme path entirely: `migrateV1Theme`, `validateV1Theme`, `AgentWidgetTheme`, and `LegacyAgentWidgetTheme` are gone. Runtime auto-detection of flat v1-shaped objects is removed; use the token tree explicitly. `DEFAULT_LIGHT_THEME` and `DEFAULT_DARK_THEME` exports are removed; defaults rely on the built-in token theme when `theme` / `darkTheme` are omitted. `DeepPartial<T>` and `resolveTokenValue` remain exported for advanced use. Code generation emits nested `theme` objects via structured serialization; composer/panel chrome reads `components.panel` and shared typography CSS variables.
  - Remove `launcher.dock.collapsedWidth`. Docked mode always uses a 0px dock column when the panel is closed; the built-in launcher stays hidden while closed. Open with `controller.open()` or your own UI. Legacy `collapsedWidth` in stored config is ignored by `resolveDockConfig`.

  ### Features

  - Add `launcher.dock.reveal`: `"overlay"` overlays the panel with `transform` while the workspace stays full width underneath; `"push"` uses a sliding track so the panel and workspace move together without animating the main column width (Shopify admin-style). Default `"resize"` keeps the flex column behavior.
  - Add `launcher.dock.reveal: "emerge"`: animate the dock column like `resize` so wrapped content reflows, while the chat panel keeps a fixed `dock.width` inside the slot (clipped until open) for a full-width floating-style entrance.
  - Add `launcher.dock.animate`. Set to `false` to disable the dock column width transition so the panel opens and closes instantly without animating main content reflow.
  - Add stable `data-persona-theme-zone` attributes to widget regions, artifact theming tokens (`ArtifactToolbarTokens`, `ArtifactTabTokens`, `ArtifactPaneTokens`), named presets (`PRESET_SHOP`, `PRESET_MINIMAL`, `PRESET_FULLSCREEN`), `onArtifactAction` callback for intercepting artifact card actions, `onTitleClick` header option, and `controller.update()` support for `loadingIndicator` and `iterationDisplay` without widget remount.
  - Add composable button utilities (`createIconButton`, `createLabelButton`, `createToggleGroup`) with full CSS variable theming and TypeScript token integration (`IconButtonTokens`, `LabelButtonTokens`, `ToggleGroupTokens`). Internal artifact toolbar, message actions, and copy menu buttons now use the shared utilities.
  - Add reusable `createDropdownMenu` utility with built-in dropdown support on header `trailingActions` via `menuItems`, artifact card customization via `renderCard` callback, header `titleRowHover` config for hover pill effects, header `shadow` and `borderBottom` theme tokens, and expanded artifact toolbar/tab tokens (`iconBackground`, `toolbarBorder`, `hoverBackground`, `listBackground`, `listBorderColor`, `listPadding`). Portal artifact copy menu to escape overflow clipping.
  - Add `createComboButton` utility: a clickable label with chevron that opens a dropdown menu, with hover pill effect, keyboard support, and portal mode. Add `layout.header.titleMenu` config shorthand that replaces the separate `trailingActions` + `onTitleClick` + `titleRowHover` pattern with a single declarative option.
  - Default artifact pane fill and document toolbar background use `components.artifact.pane` tokens resolving from `semantic.colors.container` (aligned with assistant message surfaces). Pane CSS now falls back through `--persona-components-artifact-pane-background` before raw surface/container. Override order: `features.artifacts.layout.paneBackground` (layout) → `theme.components.artifact.pane.background` / `toolbarBackground` → semantic fallbacks. `toolbarBackground` token references are resolved like other theme paths.

  ### Fixes

  - Added `theme.components.header.iconBackground` and `iconForeground` with CSS variables `--persona-header-icon-bg` and `--persona-header-icon-fg` for the avatar tile (defaults: primary / text-inverse). Added `titleForeground`, `subtitleForeground`, and `actionIconForeground` with `--persona-header-title-fg`, `--persona-header-subtitle-fg`, and `--persona-header-action-icon-fg` for header copy and default clear/close icon color (defaults: semantic primary, textMuted, textMuted). Removed default `launcher.closeButtonColor` and `launcher.clearChat.iconColor` so those header icons follow `actionIconForeground` until integrators set explicit launcher colors.
  - Docked mode: remove default panel drop shadow, use a single inner-edge border (left when docked right, right when docked left) instead of a full frame. Welcome intro card no longer uses a drop shadow when docked. Theme `components.panel.border` still overrides when set.
  - Fix docked launcher panels incorrectly becoming visible at mobile widths when closed: `recalcPanelHeight` now re-applies open/closed visibility after `applyFullHeightStyles`. The mobile fullscreen shell uses `display: flex !important` on the panel wrapper, so closed docked state now sets `display: none !important` (and clears it when opening) so the collapsed dock actually hides under the cascade.
  - Fix dock `reveal: "push"` host shell to use row flex for the push track (avoids width/overflow glitches with an explicit wide track).

## 2.3.1

### Patch Changes

- d35cbda: Fix DOMPurify hook to fully remove dangerous data: URI attributes instead of leaving empty `src`/`href`, and add a dev-mode warning when a custom `postprocessMessage` is used with the default sanitizer.

## 2.3.0

### Minor Changes

- a4b0d1e: Add built-in HTML sanitization via DOMPurify, enabled by default. Configure with the new `sanitize` option: `true` (default), `false` (disable), or a custom `(html: string) => string` function. Also fixes proxy dev-mode CORS defaults, adds prototype pollution protection in config parsing, and validates image URL schemes to block SVG data URIs and javascript: sources.

### Patch Changes

- a4b0d1e: Prevent blocked image attachments from being appended as empty broken-image placeholders when a message also contains valid image previews.

## 2.2.0

### Minor Changes

- 0e5779a: Add stable `data-persona-theme-zone` attributes to widget regions, artifact theming tokens (`ArtifactToolbarTokens`, `ArtifactTabTokens`, `ArtifactPaneTokens`), named presets (`PRESET_SHOP`, `PRESET_MINIMAL`, `PRESET_FULLSCREEN`), `onArtifactAction` callback for intercepting artifact card actions, `onTitleClick` header option, and `controller.update()` support for `loadingIndicator` and `iterationDisplay` without widget remount.

## 2.1.0

### Minor Changes

- 30f1556: Expose theme-controlled box shadows for message bubbles, tool and reasoning rows, and the composer.

  - **`AgentWidgetTheme`:** optional `messageUserShadow`, `messageAssistantShadow`, `toolBubbleShadow`, `reasoningBubbleShadow`, and `composerShadow` map into the token pipeline and consumer CSS variables (`--persona-message-user-shadow`, `--persona-message-assistant-shadow`, `--persona-tool-bubble-shadow`, `--persona-reasoning-bubble-shadow`, `--persona-composer-shadow`).
  - **Semantic tokens:** `ComponentTokens` gains `message.user.shadow`, `toolBubble`, `reasoningBubble`, and `composer` with defaults in `DEFAULT_COMPONENTS`; `themeToCssVariables` wires them to the variables above.
  - **CSS:** bubble and composer rules read those variables so shadow styling stays overridable from theme/config.
  - **V1 migration:** flat `messageUserShadow` / `messageAssistantShadow` / `toolBubbleShadow` / `reasoningBubbleShadow` / `composerShadow` keys migrate into v2 `components`; `validateV1Theme` no longer flags them as unknown deprecated properties.
  - **`toolCall.shadow`:** when set on `AgentWidgetConfig`, `applyThemeVariables` overrides `--persona-tool-bubble-shadow` on the root element.

## 2.0.0

### Major Changes

- 8c6684d: Align agent config with Runtype API and add tool support

  **Breaking:**

  - `AgentLoopConfig.maxIterations` renamed to `maxTurns` to match the Runtype API
  - `AgentLoopConfig.stopCondition` removed (API auto-detects completion)
  - `AgentExecutionState.maxIterations` renamed to `maxTurns`
  - `AgentExecutionState.stopReason` type updated: `'max_iterations'` replaced with `'max_turns'`, added `'end_turn' | 'max_cost' | 'timeout'`

  **Features:**

  - `AgentConfig` now supports a `tools` field (`AgentToolsConfig`) for configuring built-in tools (e.g., `builtin:exa`, `builtin:dalle`), MCP servers, runtime tools, and approval workflows
  - `AgentLoopConfig` now supports `maxCost` (USD budget cap)
  - New exported type: `AgentToolsConfig`

  **Fixes:**

  - Agent loop execution now works correctly: the widget was sending `maxIterations` but the API expects `maxTurns`, causing every agent request to default to a single turn
  - SSE event parsing now correctly reads `maxTurns` from `agent_start` events

- 41ffc07: Support Runtype `/v1/client/chat` `inputs` for per-turn template variables, artifact reference cards in the transcript, and related stream handling.

  **`@runtypelabs/persona`**

  - `AgentWidgetRequestPayload` and `ClientChatRequest` accept optional `inputs`
  - Client-token dispatch sends `inputs` in the chat request body alongside optional `metadata`
  - Artifact stream events (`artifact_start` / `artifact_delta` / `artifact_update` / `artifact_complete`) drive an inline **`PersonaArtifactCard`** message in the transcript (streaming → complete), including accumulated markdown on the card when the artifact is markdown
  - Tool-call UI for `emit_artifact_markdown` and `emit_artifact_component` is suppressed so artifacts are not duplicated as tool rows
  - `AgentWidgetSession.getArtifactById(id)` returns the current `PersonaArtifactRecord` for a sidebar or custom UI
  - Faster transcript morphing via message fingerprinting when reconciling assistant bubbles

  **`@runtypelabs/persona-proxy`**

  - Flow dispatch forwards client `inputs` to the upstream Runtype `/v1/dispatch` body when present
  - Bundled **bakery assistant** flow prompt updated to use root-level `inputs` placeholders (e.g. `{{page_url}}`, `{{page_context}}`) instead of metadata-only page context

  Requires Runtype API support for `inputs` on `POST /v1/client/chat` (merge into dispatch `inputs`). Agent prompts can use root-level `{{page_url}}` style variables instead of `{{_record.metadata.page_url}}` when the client sends page context as `inputs`.

- ed770cc: Complete tvw- to persona- CSS prefix migration and fix related bugs

  **Fixes:**

  - Tool call bubbles now correctly show tool names in flow mode (was reading
    `toolName` but the API sends `name` for flow-mode `tool_start` events)
  - Image attachment container now has proper flexbox layout (stale `tvw-flex`
    classes replaced with `persona-flex`)
  - Tool and reasoning bubble content areas now receive themed border and
    background colors (CSS selector targeted `.tvw-border-t` but elements
    had class `persona-border-t`)
  - Voice recording pulse animation now fires (CSS defined
    `.persona-voice-recording` but JS was adding `tvw-voice-recording`)

  **Cleanup:**

  - Migrated all remaining `tvw-` prefixed CSS classes and keyframes to
    `persona-` prefix for consistency. Zero `tvw-` references remain in source.
  - Removed dead `.tvw-approval-badge-*` CSS rules (never referenced)
  - Updated README to reflect `maxTurns`, `AgentToolsConfig`, and removed
    stale `maxIterations`/`stopCondition` documentation

  **Known limitation:**

  - Context providers configured via `contextProviders` are silently dropped
    in agent mode because the API's dispatch schema does not accept a top-level
    `context` field. This requires an API-side change to resolve.

### Minor Changes

- 85e2e7f: Add optional artifact sidebar: SSE handling for artifact events, in-session artifact store, split-pane / mobile drawer UI, `features.artifacts`, and controller / `persona:*` window hooks. Dispatch payloads accept optional `artifacts` on agent config (API parity). Includes demo page in `examples/embedded-app/artifact-demo.html`.
- 39e7b0e: Add a docked panel launcher mode that wraps a target container and renders Persona as a sibling side panel, with theme editor preview support, codegen updates, and a dedicated docked demo page.
- 41ffc07: Structured DOM context collection: score candidates before applying `maxElements`, add extensible `ParseRule` hooks with `defaultParseRules` for card-like UIs, rule-owned markdown-style summaries, and `options.mode` (`structured` default vs `simple` legacy). `formatEnrichedContext` accepts options to emit structured summaries.

  - Package README adds an **Enriched DOM context** section (imports, mode matrix, export table, custom `ParseRule` sketch) aligned with the new APIs

- 85e2e7f: Improve launcher-mode artifact layout: split gap and pane styling, configurable `features.artifacts.layout` (CSS vars, narrow-host in-panel drawer, optional launcher panel widen when artifacts are visible), optional draggable split resize (`layout.resizable`), artifact pane appearance (`paneAppearance`: `panel` / `seamless`), `paneBorderRadius`, `paneShadow`, themed borders (`paneBorder` / `paneBorderLeft`), unified split chrome (`unifiedSplitChrome`), and documentation.
- 85e2e7f: Add `components.markdown.link` and optional `heading` (h1/h2) tokens mapping to `--persona-md-link-color` and optional `--persona-md-h1-*` / `--persona-md-h2-*` overrides. Artifact `layout`: `documentToolbarShowCopyLabel`, `documentToolbarShowCopyChevron`, `documentToolbarIconColor`, `documentToolbarToggleActiveBackground`, `documentToolbarToggleActiveBorderColor` (root CSS variables). Document toolbar uses `aria-pressed` on view/source and theme-driven icon button styles.
- 85e2e7f: Artifact pane: optional `layout.paneBackground`, `layout.panePadding`, and `layout.toolbarPreset` (`document` shows view/source, copy/refresh/close, and hides the tab strip for a single artifact). Theme: `components.markdown.inlineCode`, assistant `message` border/shadow CSS vars (`--persona-message-assistant-shadow`, `--persona-md-inline-code-color`), artifact markdown styling for `.persona-markdown-bubble`. Config: `copy.showWelcomeCard`, `wrapComponentDirectiveInBubble`. Composer: `data-persona-composer-*` hooks on the default footer; rebind refs after `renderComposer` plugins. Optional `composerForm`/`textarea` guards when custom composers omit controls.
- 85e2e7f: - Extend custom `renderComposer` context with `streaming`, `openAttachmentPicker`, optional `models` / `selectedModelId` / `onModelChange`, and `onVoiceToggle` when voice is enabled.
  - Ensure attachment file input + previews exist for custom composers when `attachments.enabled` is true.
  - Reflect streaming state on the composer footer via `data-persona-composer-streaming` and optional `data-persona-composer-disable-when-streaming` controls.
  - Add optional markdown `components.markdown.prose.fontFamily` mapped to `--persona-md-prose-font-family` for `.persona-markdown-bubble`.
  - Document artifact pane desktop close behavior on `AgentWidgetArtifactsLayoutConfig`.
  - Export `AgentWidgetComposerConfig` from the package entry.

### Patch Changes

- 85e2e7f: Document artifact toolbar title: strip a trailing `· MD` from `artifact` titles before appending ` · MD` so streams that already include the suffix are not shown twice.
- 85e2e7f: Fix artifact pane not reopening after the user dismisses it: clear `persona-hidden`, force mobile drawer open when artifacts exist, and complete mobile visibility branches in the artifact pane.
- 85e2e7f: Fix artifact pane **Close** (and mobile backdrop tap) so they call the same hide path as `hideArtifacts()`, including split-desktop layouts. `syncArtifactPane` now resets mobile drawer state when the user dismisses the pane.
- 99658f7: Fix message action buttons (copy, upvote, downvote) not responding to clicks

  The event delegation handler in ui.ts used stale `tvw-` class name selectors that
  didn't match the actual `persona-` prefixed classes on the rendered buttons. This
  meant clicks were silently ignored after the class naming migration.

  Also consolidates click handling: `createMessageActions` is now a pure rendering
  function that emits buttons with `data-action` attributes. All behavior (clipboard,
  vote state, callbacks, API submission) is handled exclusively via event delegation
  in ui.ts, eliminating duplicated logic and divergent vote state that previously
  existed between the two code paths.

- 85e2e7f: Inline embed (`launcher.enabled: false`) with `launcher.fullHeight: true` now sizes the panel to 100% of the host mount width instead of the default launcher width (`min(400px, …)`).
- a4e740e: Add `persona-message-content` class on the message body wrapper for stable theme-editor / integration targeting.
- 85e2e7f: Fix `transcript_insert` SSE messages omitting `variant`: stop defaulting to `"assistant"`, which prevented component-directive rendering for messages with JSON `rawContent`.

## 1.48.0

### Minor Changes

- 7b61bce: Add barge-in voice interruption mode with always-on mic and speech detection

  - New `VoiceActivityDetector` class provides reusable RMS-based VAD with two modes: `silence` (user stopped talking) and `speech` (user started talking)
  - In barge-in mode the mic stays hot between turns: audio pipeline is reused instead of torn down after each utterance
  - During agent playback, VAD monitors for sustained speech and automatically interrupts playback to begin recording
  - Mic button shows recording state during agent speech in barge-in mode and acts as a "hang up" to end the session
  - New `isBargeInActive()` and `deactivateBargeIn()` methods on `VoiceProvider` and `Session` for UI coordination
  - Guard against late `audio_end` and audio chunks from cancelled requests

- d3ed42b: Add voice interruption and cancellation support to RuntypeVoiceProvider

  - Handle `session_config` WebSocket message to receive server-side interruption mode (`none`, `cancel`, `barge-in`)
  - New `cancelCurrentPlayback()` method stops audio playback and sends cancel request to server
  - When interruption is enabled, `startListening()` cancels in-flight responses instead of throwing
  - Track current audio element and request IDs for reliable cancellation and cleanup
  - Handle `cancelled` WebSocket message for server-acknowledged cancellation
  - Clean up audio resources on disconnect
  - Demo: conditionally show browser voice controls based on active TTS provider

## 1.47.0

### Minor Changes

- 68f7453: Add voice provider system with speech-to-text and text-to-speech support

  - New `voice/` module with `RuntypeVoiceProvider` (server-side STT via WebSocket) and `BrowserVoiceProvider` (Web Speech API fallback)
  - Factory functions `createVoiceProvider`, `createBestAvailableVoiceProvider`, and `isVoiceSupported` for provider selection
  - Session-level voice lifecycle management: `setupVoice()`, `toggleVoice()`, `isVoiceActive()`, `getVoiceStatus()`
  - `TextToSpeechConfig` type for browser and Runtype TTS with configurable voice, rate, and pitch
  - `onVoiceStatusChanged` callback for UI integration with Runtype provider status updates
  - New exports: `VoiceProvider`, `VoiceResult`, `VoiceStatus`, `VoiceConfig` types and voice factory functions

## 1.46.1

### Patch Changes

- 9485a83: Fix finalizing stale streaming messages when starting a new stream (e.g., tool messages interrupted by approval pause)

## 1.46.0

### Minor Changes

- 29dc7ad: feat: add chat input focus control via autoFocusInput config, controller.focusInput(), and persona:focusInput DOM event

  - Add `autoFocusInput` init parameter to focus input after panel open animation
  - Add `controller.focusInput()` method for programmatic focus
  - Add `persona:focusInput` DOM event with instance scoping
  - Add focus-input-demo example page with localStorage-persisted toggle

### Patch Changes

- 9b5299d: fix(event-stream): fall back to buffer when Copy All gets empty from store

  When "All events" is selected and Copy All is clicked, the code used getFullHistory() which reads from IndexedDB. If the store's DB isn't ready (e.g. open failed, private browsing), getAll() returns []. Now fall back to buffer.getAll() when the store returns empty so users get the visible in-memory events instead of [].

- 7728e64: fix(ui): keep typing indicator visible while agent resumes after approval

  Exclude approval-variant messages from the hasRecentAssistantResponse check so the typing indicator still shows while the agent resumes after user approval, instead of flickering away.

## 1.45.0

### Minor Changes

- b614fce: feat: add connectStream() to pipe external SSE streams through SDK event pipeline

  Enables streaming approval responses (and other external SSE sources) through the SDK's native message/tool/reasoning handling instead of static injection.

### Patch Changes

- b245fbe: Fix inline timestamp positioning regression in message bubbles by avoiding an always-on wrapper div around transformed text content.
- 862366b: Use theme-aware styling for approval, tool, and reasoning bubbles instead of hardcoded colors and ghost CSS classes. All three bubble types now adapt to dark mode and custom themes. Config overrides still take priority.

## 1.44.2

### Patch Changes

- 1e0dbaf: When attachments are enabled, pasted clipboard images are now added to the composer as attachments in addition to files selected from the file picker.

  Messages that include attached images now attempt to render bounded image previews directly in the chat bubble. If preview rendering fails, the existing `[Image]` fallback text is shown.

## 1.44.1

### Patch Changes

- b81e5d1: Refactor event handling in AgentWidgetClient to clarify alias usage. Updated the conditional check to maintain the order of event types for clarity, with `reason_delta` as the canonical event and `reason_chunk` as a legacy alias.

## 1.44.0

### Minor Changes

- 55f8297: Support unified SSE event names ahead of platform-wide rename

  - Accept `step_delta`, `tool_delta`, and `reason_delta` as aliases for `step_chunk`, `tool_chunk`, and `reason_chunk` (aligns with industry-standard `delta` terminology used by Anthropic, Vercel AI SDK, and OpenAI)
  - Accept `agent_reflect` as alias for `agent_reflection` (consistent `entity_verb` grammar)
  - Enrich `tool_start`, `tool_delta`, and `tool_complete` handlers to carry `agentMetadata` when the payload includes `agentContext` or direct `executionId`/`iteration` fields, supporting the upcoming unification of `agent_tool_*` events into shared `tool_*` events
  - Accept `parameters` as alias for `args` and `executionTime` as alias for `duration` in tool event payloads for forward compatibility with the unified format

  All existing event names continue to work unchanged. No breaking changes.

## 1.43.6

### Patch Changes

- 81c2585: Fix message action buttons (upvote, downvote, copy) not firing after DOM morphing by using event delegation

## 1.43.5

### Patch Changes

- e600050: Pre-initialize client session in client token mode so feedback (upvote/downvote) works before the user sends their first message (e.g. on restored or persisted messages)

## 1.43.4

### Patch Changes

- 4b23630: Consolidate R2 CDN publish into release workflow and add manual dispatch

## 1.43.3

### Patch Changes

- 3b79b5a: Fix typo in package description ("plugable" → "pluggable")

## 1.43.2

### Patch Changes

- ce823c8: Add "ai" keyword to package metadata for improved discoverability

## 1.43.1

### Patch Changes

- 69f991c: Fix SSE event stream callback lost on config update. `session.updateConfig()` was creating a new `AgentWidgetClient` without preserving the `onSSEEvent` callback, causing the Event Stream Inspector to show 0 events after any `controller.update()` call (e.g. theme changes).

## 1.43.0

### Minor Changes

- ba29509: Add SSE Event Stream Inspector - a debug panel that shows raw SSE events with filtering, search, virtual scrolling, IndexedDB persistence, and programmatic control via controller methods and window events

## 1.42.0

### Minor Changes

- fde575d: Add agent loop execution support. The widget can now operate in agent mode by setting `config.agent` with a model, system prompt, and loop configuration instead of using `flowId`. Handles all agent-specific SSE events including `agent_turn_delta` (text and thinking content), `agent_tool_*`, `agent_reflection`, and `agent_iteration_*`. Added configurable `iterationDisplay` option (`'separate'` or `'merged'`) to control how multiple agent iterations appear in the chat UI. New exported types: `AgentConfig`, `AgentLoopConfig`, `AgentRequestOptions`, `AgentExecutionState`, `AgentMessageMetadata`, `AgentWidgetAgentRequestPayload`.

  The proxy now detects agent payloads (requests containing an `agent` field) and forwards them as-is to the upstream API instead of converting them into flow dispatch payloads.

## 1.41.0

### Minor Changes

- 2d5ec5e: Add custom loading indicator and idle state support. Users can now customize loading indicators via `loadingIndicator.render` and `loadingIndicator.renderIdle` config options, or through plugin hooks `renderLoadingIndicator` and `renderIdleIndicator`. Added `showBubble` option to control bubble styling around standalone loading indicators.

## 1.40.1

### Patch Changes

- f398a27: Complete camelCase migration for step config fields and add ESLint enforcement

  Proxy step config changes:

  - `response_format` → `responseFormat`
  - `output_variable` → `outputVariable`
  - `user_prompt` → `userPrompt`
  - `system_prompt` → `systemPrompt`
  - `previous_messages` → `previousMessages`

  ESLint rule added to prevent snake_case regression in API payloads.

## 1.40.0

### Minor Changes

- 3aae116: Add embedded cart pattern support with new state hooks

  **New Features:**

  - `onStateLoaded` hook: Transform or inject messages after state loads from storage but before widget initializes. Useful for navigation-based message injection, checkout returns, or external state sync.

  - `user:message` event: Emitted when a new user message is detected. Includes `viaVoice: true` if sent via voice recognition.

  - Enhanced state persistence: Automatically restore widget open state, voice recognition state, and input focus across page navigations when using `persistState`.

  **Bug Fixes:**

  - Don't show fallback error messages when requests are intentionally aborted (e.g., user navigates away or cancels)

  **Proxy:**

  - Added `bakery-assistant` flow for the bakery demo example

  **Documentation:**

  - Added comprehensive Controller Events documentation with all available events and payload types
  - Added examples for `onStateLoaded` hook usage

## 1.39.0

### Minor Changes

- 1835807: Migrate to camelCase API convention

  Update all API interactions to use camelCase field names to match the Runtype API's native camelCase convention.

  **Breaking Change**: Requires Runtype API v2.x+ with camelCase support.

  Proxy changes:

  - `stream_response` → `streamResponse`
  - `record_mode` → `recordMode`
  - `flow_mode` → `flowMode`
  - `auto_append_metadata` → `autoAppendMetadata`

  Widget client changes:

  - Init: `flow_id` → `flowId`, `session_id` → `sessionId`
  - Response: `session_id` → `sessionId`, `expires_at` → `expiresAt`, `welcome_message` → `welcomeMessage`
  - Chat: `session_id` → `sessionId`, `assistant_message_id` → `assistantMessageId`
  - Feedback: `session_id` → `sessionId`, `message_id` → `messageId`

## 1.38.3

### Patch Changes

- e12eb21: Fix race condition with resubmit flag for async action handlers

  When an action handler returns `resubmit: true`, the library now waits for `injectAssistantMessage()` to be called before triggering the automatic model continuation. This prevents race conditions where the resubmit would fire before async operations (like API calls) completed, causing the model to hallucinate instead of using the injected data.

  Previously, the `action:resubmit` event was emitted immediately when the handler returned, which fired too early for handlers with async operations. Now, the resubmit is deferred until after the handler injects its results via `injectAssistantMessage()`.

  Handlers that use `context.triggerResubmit()` are unaffected and continue to work as before.

## 1.38.2

### Patch Changes

- 801b611: Fix race condition in action handler resubmit feature

  - Add `continueConversation()` method to session for triggering model continuation without adding a visible user message
  - Add `triggerResubmit()` function to action context, allowing handlers to trigger resubmit AFTER async work completes
  - Update resubmit handler to use `continueConversation()` instead of `sendMessage("[continue]")`
  - This fixes the race condition where resubmit would fire before async data was injected, causing the model to hallucinate results
  - The `[continue]` message is no longer visible to users

## 1.38.1

### Patch Changes

- f8ce416: Fix resubmit to use [continue] message instead of empty string

  Empty string messages were being filtered out by the session, preventing
  automatic continuation. Now sends "[continue]" as a special marker that
  signals the model should analyze previously injected results.

  Also increased resubmit delay from 150ms to 500ms to ensure async
  operations complete before triggering continuation.

## 1.38.0

### Minor Changes

- 1ecd4d8: Add resubmit flag to action handler results for automatic model continuation

  - Add `resubmit?: boolean` to `AgentWidgetActionHandlerResult` type
  - Add `action:resubmit` event to `AgentWidgetControllerEventMap`
  - When a handler returns `resubmit: true`, automatically trigger another model call
  - Enables handlers that inject data (e.g., search results) to have the model analyze and respond to that data

## 1.37.2

### Patch Changes

- 71d709e: Fix llmContent not being sent to server in client token mode

  - Add missing `llmContent` to content priority chain in client token dispatch
  - Content priority now matches proxy mode: `contentParts > llmContent > rawContent > content`
  - Fixes message injection API when using client tokens instead of proxy

## 1.37.1

### Patch Changes

- af82f7f: Use pinned package version in generated CDN URLs instead of @latest

  - Code generator now uses the installed package version in CDN URLs
  - Generated snippets use exact version (e.g., `@runtypelabs/persona@1.36.1`) instead of `@latest`
  - Ensures reproducible deployments where generated code matches the installed widget version
  - Export `VERSION` constant from package for programmatic access

## 1.37.0

### Minor Changes

- 0a08bc7: Add first-class message injection API with dual-content support

  - Add `llmContent` field to `AgentWidgetMessage` for separating user-facing and LLM-facing content
  - Add `injectMessage()`, `injectAssistantMessage()`, `injectUserMessage()`, and `injectSystemMessage()` methods
  - Update content priority chain: `contentParts > llmContent > rawContent > content`
  - Deprecate `injectTestMessage()` in favor of new injection methods
  - Add comprehensive documentation at `docs/MESSAGE-INJECTION.md`

  **New Feature: Dual-Content Messages**

  Inject messages where the displayed content differs from what the LLM receives:

  ```javascript
  // User sees rich markdown
  // LLM receives concise summary
  widgetHandle.injectAssistantMessage({
    content: "**Found 3 products:**\n- iPhone 15 Pro - $1,199...",
    llmContent: "[Search results: 3 iPhones, $799-$1199]",
  });
  ```

  This enables:

  - Token efficiency (send summaries to LLM instead of full content)
  - Sensitive data redaction (show PII to user, hide from LLM)
  - Context injection (rich LLM context with minimal UI footprint)

- 28132f6: Rename travrse to runtype and update API URLs

  - Update all references from "travrse" to "runtype" throughout codebase
  - Change API endpoint from api.travrse.ai to api.runtype.com
  - Update environment variable names (TRAVRSE_API_KEY -> RUNTYPE_API_KEY)
  - Update data attribute from data-travrse-token to data-runtype-token
  - Update CSS variable names from --travrse-_ to --runtype-_
  - Rename types TravrseFlowConfig -> RuntypeFlowConfig (with deprecated aliases)

  **Breaking Changes:**

  - Default API endpoint changed to `api.runtype.com`
  - Data attribute changed from `data-travrse-token` to `data-runtype-token`
  - CSS variables renamed from `--travrse-*` to `--runtype-*`

  **Backwards Compatibility:**

  - `TRAVRSE_API_KEY` environment variable is still supported as a fallback
  - `TravrseFlowStep` and `TravrseFlowConfig` types are exported as deprecated aliases

## 1.36.1

### Patch Changes

- 8f6b68a: Add ESLint configuration files for proper linting support
- 8f6b68a: Migrate package to @runtypelabs organization

  - Renamed from vanilla-agent to @runtypelabs/persona
  - Updated all CSS selectors and DOM IDs to use persona prefix
  - Updated localStorage keys and event names

## 1.36.0

### Minor Changes

- Improve code gen with client token

## 1.35.0

### Minor Changes

- Enable tooltip colors to be configurable

## 1.34.0

### Minor Changes

- Add attachment functionality

## 1.33.0

### Minor Changes

- Add more control over script generation

## 1.32.0

### Minor Changes

- Add ability to persist session id

## 1.31.0

### Minor Changes

- Update message event listeners and add config for header/footer visibility

## 1.30.0

### Minor Changes

- Use idiomorph for dom updates to prevent animation flicker

## 1.29.0

### Minor Changes

- Replace CSS that may conflict with parent page styles

## 1.28.0

### Minor Changes

- Move load css to be inside hydration function

## 1.27.0

### Minor Changes

- Additional hydration support within advanced script export

## 1.26.0

### Minor Changes

- Update advanced script export to support sites that hydrate dom

## 1.25.0

### Minor Changes

- Support for dark mode theme

## 1.24.0

### Minor Changes

- Enable tool call, message action, markdown, and layout config in code export

## 1.23.0

### Minor Changes

- Add feedback api support and include metadata in the chat message requests

## 1.22.0

### Minor Changes

- Message feedback mechanisms and client token support

## 1.21.0

### Minor Changes

- Improved markdown and launcher button styling

## 1.20.0

### Minor Changes

- Add panel height offset config

## 1.19.0

### Minor Changes

- Improve inline embed width and flex config

## 1.18.0

### Minor Changes

- Fix layout shift in inline embed

## 1.17.0

### Minor Changes

- Fix theme apply issue

## 1.16.0

### Minor Changes

- Add theme config reference and resolve embedded overflow issue

## 1.15.0

### Minor Changes

- Resolve rendering issues when in full height and sidebar mode

## 1.14.0

### Minor Changes

- Improve user message ux and markdown styling for lists and paragraphs

## 1.13.0

### Minor Changes

- Add markdown parsing to script generation
- Remove extra action-middleware example
- Fix lagging typing indicator after assistant message

## 1.12.0

### Minor Changes

- Add code generation methods to library export

## 1.11.0

### Minor Changes

- Improve responsiveness of inline rendering, enable sidebar rendering, and use custom components for form demo

## 1.10.0

### Minor Changes

Added:

- Component streaming hooks
- Custom fetch / header / sse parsing methods

Improved:

- Vanilla Agent DOM is now excluded from page DOM helper

Fixed

- Missed triggering of checkout middleware actions
- Duplicate triggering of click and checkout actions

## 1.9.0

### Minor Changes

- improve usability of theme presets and script generation

## 1.8.0

### Minor Changes

- Widget state events, message persistance control, and shop demo styling

## 1.7.0

### Minor Changes

- resolve test issues, simplify action middleware, and enable upstream url in proxy to be configured more easily

## 1.6.0

### Minor Changes

- added event handlers and middleware hooks

## 1.5.0

### Minor Changes

- add z-index to launcher

## 1.4.0

### Minor Changes

- implement stream parsing plugin system

## 1.3.0

### Minor Changes

- added viaVoice field to user message in send message

## 1.2.0

### Minor Changes

- added message and voice input hooks

## 1.1.0

### Minor Changes

- b7124ae: update proxy examples for vercel and cloudflare

## 1.0.0

### Major Changes

- e64d029: Initial version 😎

  Updated core interface and unified default style definitions, while adding much more configurability of elements.

## 0.2.0

### Minor Changes

- 7a52ca9: fix for css not loading in shadow dom
- 1b91c6a: renamed packages to ones that are available on npm
