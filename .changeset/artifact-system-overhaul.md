---
"@runtypelabs/persona": minor
---

Artifact system overhaul: previewable file artifacts, display modes, inline artifact blocks with document chrome, syntax-highlighted source views, custom action slots, and artifact pane polish.

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
