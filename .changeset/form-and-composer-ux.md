---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": minor
---

## `@runtypelabs/persona`

### `launcher.mountMode: "composer-bar"` — persistent pill composer

Add `launcher.mountMode: "composer-bar"` — a sleek rounded-pill composer fixed at the bottom of the viewport that morphs into an expanded chat panel on submit and minimizes back. Single composer DOM instance, so messages, drafts, and attachments persist across collapse/expand. The collapsed pill is single-row (paperclip · textarea · mic · send) with no surrounding card chrome; suggestions and status indicator stay hidden until expanded.

Configurable via `launcher.composerBar`:

- `expandedSize`: `"anchored"` (default — pill stays put, panel grows upward into a centered column above it) | `"fullscreen"` (edge-to-edge viewport) | `"modal"` (centered sheet)
- `expandedMaxWidth` (default `"880px"`) and `expandedTopOffset` (default `"5vh"`) — anchored panel sizing
- `contentMaxWidth` (default `"720px"`) — auto-centers messages, composer, suggestions, and previews horizontally inside the expanded panel; falls back to `layout.contentMaxWidth` when set
- `collapsedMaxWidth` (no default — when omitted, the pill uses the responsive defaults `90vw` / `70vw` / `50vw` at `<640` / `<1024` / `>=1024` viewports; setting it overrides with a fixed pill width) and `bottomOffset` (default `"16px"`) — pill sizing/position
- `expandOnSubmit` (default `true`), `modalMaxWidth`, `modalMaxHeight`

Internally, composer-bar mode uses a purpose-built pill composer (`pill-composer-builder.ts`) that shares low-level button factories with the regular composer (`composer-parts.ts`) — the only meaningful difference is the layout shell + className. Plugin-rendered headers and composers continue to work unchanged; stable data-attribute selectors (`data-persona-composer-form`, `-input`, `-submit`, `-mic`, `-status`) are preserved across both composer variants.

The expanded chat panel is purpose-built for this UX: a minimal corner-only header (no title bar, subtitle, or refresh button strip) with two small action icons stacked in the top-right — a clear/start-over button and the × close button — and the pill stays mounted as a viewport-fixed sibling of the chat panel chrome (always visible and interactive, never absorbed into the panel above). Clicks anywhere outside the wrapper or pill collapse back to just the pill. Both action buttons flow through the existing `launcher.closeButton*` and `launcher.clearChat.*` config (tooltip, icon, color, size) via shared `createCloseButton` and `createClearChatButton` factories in `header-parts.ts`. Set `launcher.clearChat: { enabled: false }` to render only the × close icon. Composer-bar mode sizes both icons at 16px (versus the floating launcher's 32px default) to read as a paired action group rather than a header strip.

The pill (and peek banner) live in a viewport-fixed `pillRoot` element that is a sibling of the wrapper inside the host mount node — not a descendant. This decouples the pill from the wrapper's geometry transitions: in `expandedSize: "modal"` the wrapper's `transform: translate(-50%, -50%)` no longer drags the pill toward the centered modal, and in `expandedSize: "fullscreen"` the pill stays anchored at the viewport bottom while the chat panel covers the rest of the screen. The pillRoot mirrors the wrapper's `data-state` and `data-expanded-size` attributes so peek visibility rules cascade unchanged. Pill width is set on the pillRoot itself via the same responsive `90vw / 70vw / 50vw` media-query defaults (overridable with `composerBar.collapsedMaxWidth`); pill bottom offset honors `composerBar.bottomOffset` (default `16px`). In `expandedSize: "anchored"`, the wrapper's bottom edge clears the pill area via `calc(${bottomOffset} + var(--persona-pill-area-height, 80px))` — override the CSS variable on the host if the static 80px clearance leaves a visible overlap with custom pill content.

In `expandedSize: "fullscreen"`, the chat panel covers the entire viewport and messages scroll behind the pill rather than stopping above it. The body's bottom padding is removed in this mode (so the body background extends to the viewport edge) and the messages list gains `padding-bottom: calc(${bottomOffset} + var(--persona-pill-area-height) + 16px)` so the last bubble is reachable above the pill rather than permanently obscured. Override `--persona-pill-area-height` on the host to tune the reachability gap if you've themed the pill to a non-default height.

Pressing Escape while the chat is expanded collapses back to just the pill — same end state as outside-click. Matches the WAI-ARIA dialog pattern (modal mode is literally a dialog) and the dominant chat-widget convention (Intercom, Drift, Crisp). The handler attaches on expand and detaches on collapse, so it doesn't intercept Escape outside the chat session. Guarded on `event.isComposing` so dismissing an IME suggestion (Pinyin, Kotoeri, etc.) doesn't also collapse the panel.

In `expandedSize: "modal"` and `expandedSize: "anchored"`, the wrapper's geometry transition is disabled so the panel snaps to its expanded position rather than sliding in directionally. (The wrapper goes from collapsed — no inline `top/left/transform` — to its expanded position, and the default `transform 220ms ease` would interpolate `none → translate(...)`, reading as a slide-in from the wrapper's static-default origin: diagonally from the bottom-right for modal, horizontally from the right for anchored. With pillRoot owning the visible chrome in the collapsed state, the wrapper has nothing to morph from, so the slide is pure motion noise. The container's existing opacity fade-in keyframe is enough of a reveal. Fullscreen keeps its geometry transition because that's the one mode where the wrapper genuinely morphs from empty to full viewport, and the staggered fade-in cascade is built specifically to mask the outer-edge/inner-content desync during that morph.)

The collapsed pill includes a "peek" affordance for re-entering chat history: a chrome-less row above the pill that shows a chat-bubble icon, a trailing-100-character preview of the most recent assistant message, and a chevron-up. The peek fades in while a response is streaming OR when the user hovers the composer area, and fades out otherwise. Clicking the peek expands the panel. This replaces the earlier pill-internal chat-bubble button + focus-to-open behavior, which read as composer chrome rather than as navigation.

The peek banner shares the same animation surface as the main message stream. Configure once via `features.streamAnimation` and both surfaces inherit (matching `type`, `speed`, `duration`, `buffer`, `placeholder`, and custom plugins). To animate the peek differently — e.g. faster cadence in the ticker than in the bubble — set `launcher.composerBar.peek.streamAnimation` with the same `AgentWidgetStreamAnimationFeature` shape. Carve-out: `bubbleClass` is ignored on the peek (no bubble analog); `containerClass`, `wrap` (`"char"`/`"word"`), `useCaret`, the `"skeleton"` placeholder (used when `buffer: "line"` trims to empty between line completions), and `onAfterRender` plugin hooks all port over. Per-char/per-word span IDs are namespaced with a `peek-` prefix so they don't collide with the main bubble's spans for the same message id, and use absolute char indices so animations on already-revealed chars survive each chunk's slice shift.

### Icon registry: explicit named imports + public `renderLucideIcon` export

Two changes that ship together:

1. **Public `renderLucideIcon` (and `IconName` type) export.** The widget already used this helper internally for every icon in its chrome (header, composer, launcher, tool/reasoning bubbles, attachment manager, etc.); exposing it lets custom `ComponentRenderer` authors draw the same icons without re-implementing inline SVG.

   ```ts
   import { renderLucideIcon, type IconName } from "@runtypelabs/persona";

   const clock = renderLucideIcon("clock", 14, "currentColor");
   if (clock) container.appendChild(clock);
   ```

2. **Closed icon registry — drops ~400KB from the IIFE bundle.** The previous implementation was `import * as icons from "lucide"` plus a runtime string lookup, which defeated tree-shaking; the script-tag/CDN distribution (`dist/index.global.js`) shipped all 1640 lucide icons. The registry is now a curated set of ~110 named imports covering the widget's internal usage and common UI patterns (forms, status, navigation, commerce, media, files, social, decorative). Names outside the registry return `null` and log a warning. See `packages/widget/docs/icon-registry-shortlist.md` for the full list and the rule for adding more.

**Behavior note for config consumers:** any place where you previously passed an arbitrary lucide icon name string (e.g. `launcher.callToActionIconName`, `sendButton.iconName`, `voiceRecognition.iconName`) now resolves against the closed registry. The default values are unchanged. If you were passing a custom name that isn't on the shortlist, the icon will silently render as null and you'll see a console warning telling you to add it to the registry. The new `IconName` type gives TypeScript users autocomplete and compile-time errors for unknown names.

**Side fix:** `attachment-manager.ts` previously returned `"file-json"` as the icon name for `application/json` attachments — that name doesn't exist in lucide v0.552 and silently failed. Switched to `"file-code"`.

### Component directives: preserve event listeners across morph passes

Event listeners on custom component renderers (registered via `config.components` and rendered from JSON directives) are preserved across transcript updates. Previously, serializing through `tempContainer.innerHTML` during the morph pass dropped `addEventListener`-attached listeners (e.g. `DynamicForm` submit handlers calling `preventDefault()` could revert to full-page navigation after later messages). Directive bubbles now use stub-and-hydrate like `renderAskUserQuestion`; fingerprint-gated rebuilds avoid wiping mid-stream form input when other messages re-render.

### `persistState: false` is now an explicit storage kill-switch

Make `persistState: false` an explicit kill-switch for chat-history persistence. Previously, setting `persistState: false` only suppressed UI state (open/closed, voice mode, focus) — message history was still written to the default `localStorage["persona-state"]` adapter. Now `persistState: false` also short-circuits the storage adapter: the default localStorage adapter is never created, and any user-supplied `storageAdapter` is ignored. This is the strict semantic — passing `persistState: false` means "no chat history is read or written, period." Pass `persistState: true` (or omit it) to keep the prior behavior of persisting messages via the configured `storageAdapter` (or the built-in localStorage adapter).

Why this matters: multiple widgets on the same origin (e.g. several demos served from `localhost:5173`) used to share a single `localStorage` key by default, so injecting a tool call or message in one demo would leak into the next. Setting `persistState: false` now prevents that leakage; for cases that *want* persistence, pass an explicit `storageAdapter: createLocalStorageAdapter("my-unique-key")`.

## `@runtypelabs/persona-proxy`

### `STOREFRONT_ASSISTANT_FLOW`

Add `STOREFRONT_ASSISTANT_FLOW` for product-discovery demos. The flow emits three JSON actions:

- `{"action": "show_products", "text": "...", "products": [{"id", "title", "price", "image", "description"}]}` — the host page renders these as a product card grid alongside the chat.
- `{"action": "add_to_cart", "text": "...", "item": {"id", "title", "price"}}` — the host adds the item to its cart.
- `{"action": "message", "text": "..."}` — plain conversational reply that stays in the chat panel.

Wired into `examples/persistent-composer.html` as the "Everspun" storefront demo, where asking the agent for products dynamically populates a host-page product grid below the existing hero.

### Scheduling flow: half-width form fields

Teach `DynamicForm` prompts about `width: "half"` so the AI can pair short related inputs (e.g. Phone + Company, City + Zip) side-by-side instead of stacking every field full-width.
