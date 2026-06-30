# Context mentions for the composer

**Context mentions** let users explicitly pull external context into a turn:
either by typing `@` in the composer or by clicking a visible context button
next to it. Both open the same searchable menu of files, documents, data
sources, agents, or page entities; selecting one attaches that context to the
message as a removable chip before send.

This guide is an implementation plan for adding the pattern to Persona. It is
informed by the [Context Mentions](https://aiuxplayground.com/pattern/mention/)
and related [Context Chip Management](https://aiuxplayground.com/pattern/context-chip-management/)
patterns from AI UX Playground, and by the current widget architecture
(`packages/widget`).

> **Framing:** Persona is an embeddable assistant widget whose end users are
> often non-technical site visitors. A keyboard-only `@` trigger gets near-zero
> discovery with that audience. So we treat the trigger character and the
> Context Chip Management `+`/`@` button as **one feature with two entry
> points over a shared menu** — not two patterns shipped in two phases. This is
> how Slack, Linear, and Notion all work: a visible affordance *and* the
> keyboard accelerator.

---

## Pattern summary

| Product | Behavior |
| --- | --- |
| **Cursor** | `@` opens grouped file/doc picker; `@`-files attach as context pills, not inline prose |
| **Notion AI** | `@` references pages, databases, people |
| **Slack** | `@` mentions users/channels with autocomplete; visible affordance + keyboard |
| **Linear** | `@` references issues, projects, teams |

**Two distinct concepts often conflated.** It matters which one we are building:

1. **Inline mention** (Slack/Linear/Notion): the `@name` stays *in the sentence*
   as a styled, atomic token; it is semantically part of the prose. Non-fragile
   only with `contenteditable`.
2. **Context attachment** (Cursor `@`-files, ChatGPT/Claude file pills): `@` is a
   *picker shortcut* that attaches context shown as a **chip/pill** separate from
   the prose. The typed query is not left in the text.

**Persona v1 targets concept #2.** We commit to it fully: selecting a mention
removes the typed `@query` from the textarea and represents the mention only as a
chip in the composer context row. This matches the widget's existing attachment
mental model, needs no rich-text editor, and avoids an entire class of
text/chip desync bugs (see [UX decision #1](#open-decisions)). Inline styled
tokens (concept #1) are the v2 contenteditable upgrade.

---

## Current Persona state

### What exists today

| Capability | Location | Relevance |
| --- | --- | --- |
| Plain `<textarea>` composer | `composer-parts.ts` (`createComposerTextarea`), `composer-builder.ts`, `pill-composer-builder.ts` | Shared input surface; no rich-text or inline tokens |
| Attachment chips (file picker) | `attachment-manager.ts`, `composer-parts.ts` | Chip **row container + remove logic** to reuse (but chips are 48×48 thumbnails — mentions need compact pills) |
| Passive page context | `config.contextProviders` → `client.buildAgentPayload()` | Injects context on **every** request; not user-selected per turn |
| Display vs LLM content split | `content`, `llmContent`, `contentParts` on `AgentWidgetMessage` | Resolution target. **Model sees `contentParts > llmContent > rawContent > content`** — not `context` |
| Composer keyboard handling | `ui.ts` (`handleComposerKeydown`, ~5561) | Enter submit, Up/Down history (gated on caret `atStart`), `isComposing` guards — single handler the menu must branch from |
| Composer history | `utils/composer-history.ts` | Up/Down recall is text-only; will not restore mentions on recalled messages |
| Floating popover primitive | `plugin-kit.ts` → `createPopover()` | **Element-anchored** (`getBoundingClientRect`), Shadow-DOM safe, supports `top-start` + `matchAnchorWidth`. **No caret anchoring.** |
| Custom composer hook | `plugins/types.ts` → `renderComposer` | Escape hatch for fully custom mention UX |
| Smart DOM page reader | `@runtypelabs/persona/smart-dom-reader` | First-class mention **source** for page elements (ship it supported, not just as a demo) |

### What's missing

- No `@` trigger detection, no visible context affordance, no autocomplete UI
- No per-message, user-selected context (only global `contextProviders`)
- No mention model on messages or in the dispatch payload
- No mention chip rendering in the composer or in sent user bubbles
- No default fuzzy matcher / static-source helper for integrators

---

## Design goals and non-goals

### Goals (v1)

1. **Two entry points, one menu:** a visible composer context button **and**
   typing `@` both open the same filterable menu, anchored to the composer
2. The menu opens **instantly** (cached/recent items); only async network search
   is debounced, never the menu's appearance
3. Hosts register **mention sources** (search + resolve); the widget ships a
   default fuzzy matcher and a `createStaticMentionSource` helper so the baseline
   quality is high without host effort
4. Selecting a mention **removes the typed `@query`** and adds a removable
   **compact pill chip** to the composer context row (chip-only; no inline token)
5. Mentions resolve **on select** (cached, abortable), so submit stays instant
   and the user's message echoes immediately; per-source opt-in to submit-time
   resolution for time-sensitive sources
6. Resolved content reaches the model by default via the **LLM-visible channel**
   (`llmAppend`/`contentParts`), so it works with no backend changes
7. Works in **full composer**, **pill composer**, **Shadow DOM**, and **touch**
8. Keyboard accessible: ↑/↓ navigate, Enter/Tab select, Esc dismiss (and keeps a
   literal `@`); Backspace removes the last chip from an empty composer
9. Graceful failure: a failed `resolve` drops that mention and still sends
10. **Zero bundle cost when unused:** sites that don't set
    `contextMentions.enabled: true` download effectively no mention code. The
    feature ships as a lazy sibling chunk, not statically in the core bundle (see
    [Bundle strategy](#bundle-strategy-zero-cost-when-unused))
11. **Extensible at three levels:** swap *sources* (host-provided), override the
    *menu/chip renderers* (mid-level hooks), or replace the *whole composer*
    (`renderComposer` plugin hook)

### Non-goals (v1)

- Inline `contenteditable` styled tokens inside the textarea (Cursor-styled
  prose) — deferred to v2; v1 is chip-only
- Caret-coordinate-anchored popover — v1 anchors the menu to the composer
  element (opens upward), which is simpler, mobile-correct, and uses
  `createPopover` as-is
- Slash commands (`/`) — separate pattern; share infrastructure later
- Server-side mention indexing — host provides sources
- Replacing `contextProviders` — mentions are **explicit per-turn**; providers
  stay **implicit ambient**
- Restoring mentions when recalling a past message via Up-arrow history (text
  recall only; documented limitation, full fix in Phase 4)

---

## Proposed architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Composer context row  [📄 App.tsx ×]  [🔧 search_db ×]     │  ← compact PILL chips (not 48×48 thumbs)
├─────────────────────────────────────────────────────────────┤
│  Attachment chips row  [photo.png ×]                        │  ← existing (separate row v1)
├─────────────────────────────────────────────────────────────┤
│  [@]  Composer (textarea)  "Check this for errors"   [↑]   │  ← [@] = visible affordance button
└─────────────────────────────────────────────────────────────┘
     │ click [@]  /  type @         ▲ menu opens UPWARD, anchored to composer
     ▼                              │ (createPopover placement:"top-start", matchAnchorWidth)
┌──────────────────────────┐       │
│  MentionController        │───────┘
│   - detect @query (pure)  │
│   - debounce ASYNC search │       on select ──► resolve() eagerly (abortable), cache on chip
│   - default fuzzy matcher │                     strip @query from textarea, add pill chip
│   - keyboard nav          │
│   - composer-anchored menu│       on submit ──► sync; gather cached payloads
└──────────────────────────┘                          │
                                                       ▼
                                    ┌─────────────────────────────────┐
                                    │ session.sendMessage(text, {     │
                                    │   contentParts, mentions })     │
                                    └──────────────┬──────────────────┘
                                                   ▼
                                    ┌─────────────────────────────────┐
                                    │ client.buildPayload              │
                                    │  merge cached mention payloads:  │
                                    │  llmAppend/contentParts (default,│
                                    │  model-visible) + context (opt-in)│
                                    └─────────────────────────────────┘
```

### Core modules (new)

| Module | Responsibility |
| --- | --- |
| `utils/context-mention-types.ts` | Shared types |
| `utils/context-mention-manager.ts` | State: pending mentions, **pill** chip DOM, eager resolve + cache + abort, duplicate/limit checks, resolve-on-select status (spinner→ready) |
| `utils/context-mention-controller.ts` | `@` detection, query extraction, debounced **async** search, default fuzzy matcher, keyboard nav (pure logic, testable) |
| `utils/mention-matcher.ts` | Exported `defaultMentionFilter(items, query)` (prefix > word-boundary > subsequence, recency boost) + `createStaticMentionSource()` helper |
| `components/context-mention-menu.ts` | Autocomplete menu DOM (grouped, loading/empty/error states), positioned via `createPopover` |
| `components/context-mention-chip.ts` | Single **compact pill** chip renderer (icon + label + ×, ~26px) |
| `components/context-mention-button.ts` | Visible composer affordance that opens the menu |

### Integration points (existing)

| File | Change |
| --- | --- |
| `types.ts` | New config + message fields + source/payload interfaces (types only — erased at build, **zero bundle bytes**) |
| `ui.ts` | Thin orchestrator only: read `contextMentions.enabled`, render the affordance button, and **`await import()` the lazy chunk (external dynamic import, never static)** on first `@`/click; **extend `handleComposerKeydown` with a menu-open branch at the top** (single handler, not a competing listener); keep `handleSubmit` synchronous. See [Bundle strategy](#bundle-strategy-zero-cost-when-unused) |
| `session.ts` | Accept `mentions` (with cached resolved payloads) in `sendMessage()` options |
| `client.ts` | Merge cached mention payloads into the message — `llmAppend`/`contentParts` by default, `context.mentions` when opted in |
| `composer-parts.ts` | Mention context row container + affordance button slot |
| `plugins/types.ts` | Extend `renderComposer` context with mention APIs |
| `styles/widget.css` | `--persona-mention-*` chip + menu tokens (**Phase 1**, not later) |
| `index-global.ts` | Register a loader that derives the `context-mentions.js` sibling URL from the widget script `src` (mirror the `webmcp-polyfill.js` loader) |
| `tsup.global.config.ts` | Add the mention chunk specifier to `esbuildOptions.external` (next to `@mcp-b/webmcp-polyfill` / `./runtype-tts-entry` / `./markdown-parsers-entry`) so the IIFE build doesn't inline it |
| `tsup.context-mentions.config.ts` (new) + `package.json` | New `build:context-mentions` target producing `dist/context-mentions.js`; add to the `build` chain (mirror `tsup.webmcp-polyfill.config.ts`) |

---

## Bundle strategy (zero cost when unused)

The CDN/IIFE bundle (`dist/index.global.js`) is built with **`--splitting
false`** (see `build:client` in `package.json` and `tsup.global.config.ts`).
There is **no** automatic tree-shaking of imported-but-unused code in that
bundle: anything statically `import`ed by `ui.ts` / `client.ts` / `session.ts`
ships to **every** install. So `contextMentions.enabled` (default `false`) is a
*runtime* gate, not a *build* gate — on its own it would still download all the
mention code to sites that never turn it on.

To make mentions truly pay-for-what-you-use, follow the **lazy sibling chunk**
pattern this repo already uses for three optional features:
`@mcp-b/webmcp-polyfill` (`dist/webmcp-polyfill.js`), the Runtype TTS engine
(`./runtype-tts-entry`), and the markdown parsers (`./markdown-parsers-entry`).
Each is marked `external` in `tsup.global.config.ts` and dynamically imported
from a sibling URL at runtime only when its feature is on.

### What ships in the core bundle (always)

- The `types.ts` additions — TS types are erased at build, **zero bytes**.
- A **thin orchestrator** (a few hundred bytes): reads
  `config.contextMentions?.enabled`; when enabled, renders the **affordance
  button** so the feature is discoverable *before* the chunk loads; on the first
  `@`/button interaction (optionally prefetched on composer focus) it
  **dynamically imports** the mention chunk. When the flag is off, none of this
  renders and nothing is fetched.

### What ships in the lazy chunk (only when enabled)

- `context-mention-controller`, `-manager`, `mention-matcher`,
  `context-mention-menu`, `context-mention-chip`, and the rest of the runtime —
  i.e. everything heavy.

### Wiring contract (the part that's easy to get wrong)

1. **New build target** `dist/context-mentions.js`: a dedicated
   `tsup.context-mentions.config.ts` (mirror `tsup.webmcp-polyfill.config.ts` —
   `splitting: false`, self-contained), plus a `build:context-mentions` script
   added to the `build` chain in `package.json`.
2. **Mark it external in the IIFE build**: add the chunk's import specifier to
   `options.external` in `tsup.global.config.ts`, next to the existing three.
   Without this, esbuild inlines it straight back into the core bundle.
3. **Loader in `index-global.ts`**: derive the `context-mentions.js` sibling URL
   from the widget script `src` (reuse the helper that resolves
   `webmcp-polyfill.js`) so the dynamic import resolves on CDN installs.
4. **`ui.ts` must use an *external dynamic* import, never a static one.** Mirror
   `webmcp-bridge.ts`'s `import("@mcp-b/webmcp-polyfill")`: a single
   `await import("./context-mentions-entry")` behind the enabled-flag +
   first-interaction. Any static `import { … } from "…"` on the core path
   defeats the whole scheme — esbuild pulls the chunk into `index.global.js`.
5. **ESM/npm consumers**: tree-shaking already excludes the modules if they're
   only reachable through the dynamic import. Additionally expose
   `@runtypelabs/persona/context-mentions` as a named entry point (mirror
   `smart-dom-reader`) for bundler consumers who'd rather import it eagerly.

### CSS

`--persona-mention-*` tokens + the chip/menu utility classes are bytes in the
monolithic `widget.css`, shipped to everyone. Acceptable for a handful of custom
properties. If it grows, have the lazy chunk inject its own `<style>` on load
(it runs in the same Shadow root), keeping the always-shipped CSS near zero.

### Net effect

- **Disabled site:** types only (0 bytes) + nothing rendered + nothing fetched.
- **Enabled site:** the small orchestrator + affordance button eagerly; one
  extra chunk fetch on first `@`/focus.

---

## Public API design

### Config

```typescript
// types.ts — new
export type AgentWidgetContextMentionConfig = {
  /** @default false */
  enabled?: boolean;
  /** Show the visible composer affordance button (the discoverable entry
   *  point). Strongly recommended; the bare `@` trigger alone is hard to
   *  discover for non-technical users. @default true */
  showButton?: boolean;
  /** Icon for the affordance button. @default "at-sign" */
  buttonIconName?: string;
  /** Trigger character. @default "@" */
  trigger?: string;
  /** Max mentions per message. @default 8 */
  maxMentions?: number;
  /** Max items shown per source group before "keep typing to narrow".
   *  @default 6 */
  maxItemsPerGroup?: number;
  /** Debounce for ASYNC source search only (ms). Synchronous sources and the
   *  menu's first paint are never debounced. @default 150 */
  searchDebounceMs?: number;
  /** Registered mention sources (search + resolve). */
  sources: AgentWidgetContextMentionSource[];
  /** Chip icon fallback when a source/item omits one. @default "at-sign" */
  chipIconName?: string;
  onMentionRejected?: (item: AgentWidgetContextMentionItem, reason: "duplicate" | "limit") => void;
  /** A resolve() that throws/aborts: the mention is dropped and the message
   *  still sends. Surface a non-blocking notice here if desired. */
  onMentionResolveError?: (item: AgentWidgetContextMentionItem, error: unknown) => void;
  /**
   * MID-LEVEL render override for the autocomplete menu. The widget still owns
   * trigger detection, search, debounce/abort, keyboard nav, and positioning;
   * you only supply the menu markup and call back through `ctx` to drive
   * selection/highlight. Omit to use the built-in grouped menu. Use this when
   * you want Persona's behavior with your own menu DOM — short of replacing the
   * whole composer via the `renderComposer` plugin hook. @default built-in
   */
  renderMentionMenu?: (ctx: AgentWidgetContextMentionMenuRenderContext) => HTMLElement;
  /**
   * MID-LEVEL render override for a single context chip. Return your own pill
   * (must include an accessible remove control wired to `ctx.remove`). Reflect
   * `ctx.status` for resolve-on-select. Omit to use the built-in compact pill.
   * @default built-in
   */
  renderMentionChip?: (ctx: AgentWidgetContextMentionChipRenderContext) => HTMLElement;
};

// On AgentWidgetConfig:
contextMentions?: AgentWidgetContextMentionConfig;
```

### Source interface (host-provided)

```typescript
export type AgentWidgetContextMentionItem = {
  id: string;           // stable key within source
  label: string;        // shown in menu + chip ("App.tsx")
  description?: string;  // subtitle in menu
  iconName?: string;     // Lucide icon
  group?: string;        // "Files", "Agents", "Page"
  /** Optional recency/score hint the default matcher can boost on. */
  recencyScore?: number;
};

export type AgentWidgetContextMentionSource = {
  id: string;
  label: string;         // group header
  /**
   * Filter items for the current @query (empty query → recent/popular).
   * Two supported shapes:
   *  - server-side: implement search() yourself for large/remote sets
   *  - client-side: return all items and let the widget filter/rank with
   *    defaultMentionFilter (use createStaticMentionSource for the common case)
   */
  search: (query: string, ctx: AgentWidgetContextMentionSearchContext) =>
    AgentWidgetContextMentionItem[] | Promise<AgentWidgetContextMentionItem[]>;
  /**
   * Fetch the payload for dispatch. Called once when the user SELECTS the item
   * (eagerly, cached on the chip, abortable on removal) unless resolveOn is
   * "submit". A throw/abort drops the mention via onMentionResolveError.
   */
  resolve: (item: AgentWidgetContextMentionItem, ctx: AgentWidgetContextMentionResolveContext) =>
    AgentWidgetContextMentionPayload | Promise<AgentWidgetContextMentionPayload>;
  /**
   * When to call resolve():
   *  - "select" (default): eager on pick; parallelizes the fetch with the user
   *    finishing their sentence; submit stays instant.
   *  - "submit": defer to send time, for sources whose content is time-sensitive
   *    (e.g. "current page state" that may change between select and send).
   * @default "select"
   */
  resolveOn?: "select" | "submit";
};

export type AgentWidgetContextMentionPayload = {
  /**
   * PRIMARY, model-visible channel. Appended to this user message's LLM content
   * so the model actually sees the context with NO backend changes. Lead with
   * this unless you have a flow that consumes structured `context`.
   */
  llmAppend?: string;
  /** Extra content parts (e.g. file text / image) via the multi-modal path. */
  contentParts?: ContentPart[];
  /**
   * OPT-IN structured channel. Merged into request `context` under
   * `mentions.<sourceId>.<itemId>` for flows/agents that read it. NOTE: ambient
   * `context` is NOT guaranteed to reach the model — use llmAppend if you need
   * the model to see it.
   */
  context?: Record<string, unknown>;
};

export type AgentWidgetContextMentionSearchContext = {
  messages: AgentWidgetMessage[];
  config: AgentWidgetConfig;
  /** Abort signal for in-flight async search (next keystroke aborts prior). */
  signal: AbortSignal;
};

export type AgentWidgetContextMentionResolveContext = AgentWidgetContextMentionSearchContext & {
  /** Plain-text composer value at resolve time. */
  composerText: string;
};

// --- Mid-level render hook contexts (optional overrides; see config) ---

export type AgentWidgetContextMentionMenuRenderContext = {
  /** Current trigger query ("" when freshly opened). */
  query: string;
  /** Grouped, ranked, capped results ready to paint. */
  groups: { source: AgentWidgetContextMentionSource; items: AgentWidgetContextMentionItem[] }[];
  /** Per-group async state for loading/empty/error rendering. */
  status: Record<string, "loading" | "ready" | "empty" | "error">;
  /** Index into the flat keyboard-traversal order, owned by the controller. */
  activeIndex: number;
  /** Commit a selection (runs strip-@query + add-chip + resolve-on-select). */
  select: (item: AgentWidgetContextMentionItem) => void;
  /** Close the menu, keeping a literal `@`. */
  close: () => void;
};

export type AgentWidgetContextMentionChipRenderContext = {
  ref: AgentWidgetContextMentionRef;
  /** Resolve-on-select lifecycle for spinner→ready→error UI. */
  status: "resolving" | "ready" | "error";
  /** Remove the chip; aborts any in-flight resolve. */
  remove: () => void;
};
```

### Helpers shipped with the widget

```typescript
// utils/mention-matcher.ts — exported for hosts
export function defaultMentionFilter(
  items: AgentWidgetContextMentionItem[],
  query: string
): AgentWidgetContextMentionItem[]; // prefix > word-boundary > subsequence, recency boost

/** The easy path: a static list filtered client-side with defaultMentionFilter. */
export function createStaticMentionSource(opts: {
  id: string;
  label: string;
  items: AgentWidgetContextMentionItem[];
  resolve: AgentWidgetContextMentionSource["resolve"];
  resolveOn?: "select" | "submit";
}): AgentWidgetContextMentionSource;
```

### Message model

```typescript
// Stored on the user message for transcript fidelity + history
export type AgentWidgetContextMentionRef = {
  sourceId: string;
  itemId: string;
  label: string;
  iconName?: string;
};

// AgentWidgetMessage — add:
contextMentions?: AgentWidgetContextMentionRef[];
```

### Payload merge strategy (recommended)

At `client.buildPayload()` / `buildAgentPayload()`, mentions are **already
resolved and cached** on each pending mention (resolve happened on select). At
submit:

1. Gather the cached payload for each mention (resolve any `resolveOn: "submit"`
   sources now; drop and report any that fail via `onMentionResolveError`)
2. **Default / always-works path:** concatenate every `llmAppend` into the user
   message's LLM content, and merge `contentParts` via the existing multi-modal
   path. This is what reaches the model. Pick and document one convention for
   ordering relative to the user's typed text (recommendation: mentions first,
   as a labeled context block, then the user's prose)
3. **Opt-in structured path:** merge any `context` objects into
   `payload.context.mentions`, namespaced by `sourceId` + `itemId`. Document
   that this is only consumed by flows/agents that read it
4. **Dedup guidance:** if a host also wires the same source as an ambient
   `contextProvider`, warn against double-injection (e.g. smart-dom as both)

**Display text:** The textarea never contained the `@query` (stripped on
select), so `content` is already clean prose. The mention refs live on
`contextMentions` and render as chips in the sent bubble.

---

## UX specification

### Entry points (discoverability is the #1 adoption lever)

- **Visible affordance button** in the composer (default on) — opens the menu.
  This is how non-technical users find the feature. It and the `@` trigger open
  the **same menu**.
- **`@` trigger** as the keyboard accelerator for power users.

### Trigger and query detection

1. `@` (typed, or button click) → open menu **instantly** with an empty-query
   state: a short, grouped, curated list (recents + a few suggestions per
   source), capped per group. The empty state is the discovery moment — keep it
   scannable, not a dump
2. `@App` → filter across sources (default fuzzy matcher unless the source
   searches server-side); highlight the matched span
3. `@` inside an email (`user@example.com`) → **do not** open (require
   whitespace or start-of-input before `@`)
4. **Paste does not trigger:** gate on `inputType` — open on `insertText` of the
   trigger, never on `insertFromPaste`
5. **Literal `@`:** Esc closes the menu and **keeps** the typed `@`; a space
   typed right after `@` with no selection closes and leaves the `@` literal
6. Deleting back through `@` → close menu
7. IME: never open mid-composition (guard `event.isComposing`, mirroring
   `handleComposerKeydown` at `ui.ts:5572`)

Implementation note: a small pure function over `(value, caretIndex, inputType)`
— same approach as Slack/Discord parsers. No contenteditable for v1.

### Menu timing and quality

- **Instant frame:** render the menu shell immediately; synchronous sources
  populate with zero debounce
- **Async sources:** debounce only the network call (`searchDebounceMs`); show a
  per-group loading shimmer; abort the prior search on the next keystroke
- **Caps:** `maxItemsPerGroup` per group with a "keep typing to narrow" hint;
  defined flat keyboard-traversal order across groups
- **States:** loading / empty ("No matches") / error ("Couldn't load {group}")
  are all **Phase 1** — async sources fail and empty out constantly

### On selection (chip-only)

1. **Remove the `@query`** text from the textarea entirely (no inline token, no
   range tracking)
2. Add a **compact pill** chip to the composer context row
3. **Eagerly call `resolve()`** (unless `resolveOn: "submit"`); show
   spinner→ready status on the chip; cache the payload on the pending mention
4. Close menu; restore focus to textarea
5. Track `{ sourceId, itemId, label, iconName, status, payload?, abort }` in
   `ContextMentionManager`

### Chip row

- Reuse the attachment row **container + remove logic**, but the chip itself is a
  **compact pill** (~26px: icon + label + ×) — *not* a 48×48 thumbnail
- Place **above** the textarea; attachment previews remain a separate row in v1
  (merge into one "Context" row in v2 if crowded)
- Each chip: icon + label + remove button; `aria-label="Remove App.tsx context"`
- **Backspace** with an empty textarea / caret at start removes the last chip
  (Slack/Linear micro-interaction; composes with the existing `atStart` check at
  `ui.ts:5574`)
- Removing a chip **aborts** any in-flight resolve for it

### Menu positioning

- Anchor to the **composer element** (not the caret), `createPopover` with
  `placement: "top-start"`, `matchAnchorWidth: true` → a full-width menu opening
  **upward** (correct: composer sits at panel bottom; upward avoids clipping and
  the mobile keyboard). Uses `createPopover` as-is — no caret measurement
- Shadow-DOM safe via `createPopover`'s default container logic

### Mobile / touch

- Composer-anchored upward menu sits **above** the soft keyboard
- Touch targets ≥44px; tap selects; the affordance button is the primary mobile
  entry point (typing `@` on mobile keyboards is friction)

### Sent message rendering

**v1:** render the mention pills in the user bubble (from `contextMentions`),
like attachments. `content` is already clean prose (query stripped on select),
so there is no token/text duplication to reconcile.

**v2:** inline styled spans via contenteditable.

### Keyboard precedence (critical) — one handler

Extend the existing `handleComposerKeydown` (`ui.ts:5561`) with a **menu-open
branch at the top**. Do **not** add a competing capture-phase listener — two
listeners racing on the same textarea keydown is how ordering bugs start.

When the mention menu is **open**:

| Key | Action |
| --- | --- |
| ↑ / ↓ | Navigate menu items (**not** composer history) |
| Enter / Tab | Select highlighted item |
| Esc | Close menu, keep literal `@` |
| Backspace at empty query after `@` | Close menu |

When the menu is **closed**: existing behavior unchanged (Up/Down history gated
on `atStart`, Enter submit, `isComposing` guards). Backspace on an empty
composer with chips present removes the last chip.

### Accessibility

- Menu: `role="listbox"`, items `role="option"`, `aria-activedescendant`
- Composer: `aria-haspopup="listbox"` + `aria-expanded` / `aria-controls` while
  open. Avoid full `role="combobox"` on the multiline chat textarea — it fights
  screen-reader expectations for a message input
- Polite **live region** announcing result counts ("5 results") and selection
  ("Added App.tsx to context")
- Respect reduced-motion on menu/chip transitions

---

## Implementation phases

> **Status (implemented):** Phases 1–3 are built, wired, and verified — widget
> build/lint/typecheck pass and the full suite is green (1399 tests, incl. the
> new parser/matcher/manager/controller/orchestrator/bundle/smart-dom tests).
> The `apps/web` demo bundles via Vite. Phase 4 remains deferred (future).

### Phase 1 — Foundation (the complete, good loop)

- [x] Types: config, source/payload interfaces (incl. `resolveOn`,
      `onMentionResolveError`), message refs
- [x] `utils/mention-matcher.ts`: `defaultMentionFilter` + `createStaticMentionSource`
- [x] `parseMentionTrigger()` + `stripMentionQuery()` — pure, unit tested
      (incl. `inputType` paste gating, literal-`@`, IME guard, email edge case)
- [x] `ContextMentionController` — instant open, async-only debounce, abort,
      default matcher, per-group caps, keyboard nav
- [x] `ContextMentionManager` — add/remove/list, **eager resolve-on-select +
      cache + abort**, compact-pill chip DOM, duplicate + limit checks
- [x] `context-mention-menu.ts` — menu DOM (grouped, loading/empty/error
      states), positioned via `createPopover` `top-start` + `matchAnchorWidth`
- [x] `context-mention-button.ts` — **visible affordance** opening the menu
- [x] `context-mention-chip.ts` — compact pill renderer
- [x] Theme tokens: `--persona-mention-*` in `widget.css` (chip + menu)
- [x] **Lazy chunk build:** `tsup.context-mentions.config.ts` + `build:context-mentions`
      → `dist/context-mentions.js`; added to the `build` chain
- [x] **Mark external + loader:** chunk specifier added to
      `tsup.global.config.ts` `esbuildOptions.external`; sibling-URL loader
      registered in `index-global.ts` (mirrors `webmcp-polyfill.js`)
- [x] Wired into `ui.ts` as a **thin orchestrator**: renders the affordance
      button when enabled; **`await import()`s the chunk (external dynamic
      import)** on first `@`/click; extends `handleComposerKeydown` (menu-open
      branch first); Backspace-removes-last-chip
- [x] `handleSubmit` stays **synchronous**; gathers cached payloads; submit
      sources resolve in `session` before dispatch; failures dropped via
      `onMentionResolveError`
- [x] Extend `session.sendMessage({ mentions })`
- [x] `client.ts` merge — **`llmAppend`/`contentParts` default (model-visible)**;
      `context.mentions` opt-in
- [x] Mid-level hooks: `renderMentionMenu` / `renderMentionChip` honored with
      built-in fallbacks
- [x] `createStaticMentionSource` demo source behind `contextMentions.enabled`
- [x] Changeset + unit tests (parser, matcher, manager resolve/abort, controller)
- [x] **Bundle test:** asserts `dist/index.global.js` contains no mention runtime
      (only the dynamic-import stub) — guards against an accidental static import
- [x] Feature flag: `contextMentions.enabled` (default `false`)

### Phase 2 — Composer parity and polish

- [x] Pill composer support (binds via the shared `data-persona-composer-*`
      refs, so it works in the pill composer without extra wiring)
- [x] Grouped menu refinements; "keep typing to narrow" affordance
- [x] User bubble rendering for mention pills (`message-bubble.ts`)
- [x] Keyboard/precedence integration tests (orchestrator lazy-load,
      menu-open-blocks-history, Backspace-removes-chip)
- [ ] Merge mention + attachment rows into one "Context" row if crowded
      (deferred — separate rows for v1, as planned)
- [x] First-class **smart-dom** mention source — `createSmartDomMentionSource`
      shipped from `@runtypelabs/persona/smart-dom-reader` (+ test)
- [x] Analytics: `persona:mention:*` DOM events (opened/searched/selected/
      rejected/resolve-error)

### Phase 3 — Demo and built-in sources

- [x] `apps/web/context-mentions-demo.html` — static file source +
      `createSmartDomMentionSource`, on inline + launcher composers
- [x] Example source package snippet in docs (README, leads with `llmAppend`)
- [ ] Theme editor section (optional — not done)

### Phase 4 — Advanced (future)

- [ ] Inline `contenteditable` composer with atomic mention nodes (concept #1)
- [ ] `@agent` routing (switch active agent/model per mention)
- [ ] Shared infrastructure with slash commands
- [ ] Mention persistence in composer history recall (today: Up-arrow recall is
      text-only and drops mentions — documented v1 limitation)
- [ ] Voice input: speak "at App dot tsx" → token insertion

---

## Built-in source ideas

| Source ID | Items | Resolve | Status |
| --- | --- | --- | --- |
| `static-files` | `createStaticMentionSource` list | Return file contents (`llmAppend`) | Demo |
| `smart-dom` | Visible page elements by label/selector | `collectSmartDomContext()` scoped to selection; `resolveOn:"submit"` (page is time-sensitive) | **Ship supported** |
| `session-messages` | Prior user/assistant messages | Quoted excerpt into `llmAppend` | Demo |
| `webmcp-tools` | Registered page tools | Tool schema snippet | Demo |

The widget ships the **mechanism plus a high baseline** (default matcher, static
helper) and **one genuinely supported source** (smart-dom) so integrators get
day-1 value without authoring a source first.

---

## Testing strategy

| Layer | Tests |
| --- | --- |
| Parser | `@` at start / mid-word, email edge case, **paste (`inputType`) gating**, literal-`@` (Esc / space), multi-byte, IME (`isComposing`) |
| Matcher | `defaultMentionFilter` ordering (prefix > word-boundary > subsequence), recency boost, `createStaticMentionSource` |
| Controller | Instant open, async-only debounce + **abort on next keystroke**, multi-source merge, per-group caps, keyboard selection index |
| Manager | Duplicate/limit rejection, **resolve-on-select cache + abort on remove**, `resolveOn:"submit"`, resolve-failure drops mention + fires `onMentionResolveError` |
| Integration | `ui` keyboard: menu open blocks history nav; Backspace removes last chip; submit stays synchronous and clears mentions; affordance button opens same menu |
| Client | Merge: `llmAppend`/`contentParts` reach LLM content; `context.mentions` namespacing opt-in |
| Bundle | **`dist/index.global.js` contains no mention runtime** (only the dynamic-import stub) — fails if a static import sneaks the chunk into the core bundle |
| Visual | Manual on full + pill + shadow DOM + **mobile** demos |

Follow existing pattern: pure logic in `utils/`, DOM-light component tests,
extend `ui.composer-keyboard.test.ts`.

---

## Open decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | **Textarea token vs contenteditable** | **Chip-only, no inline token, no range tracking** for v1 (commit to context-attachment model). Inline styled tokens = v2 contenteditable |
| 2 | **Strip `@Label` from display text on send?** | **Moot** — query is stripped on *select*; prose never contains it; `content` is already clean |
| 3 | **Merge mention row with attachment row?** | Separate rows v1; single "Context" row v2 if crowded |
| 4 | **Where in payload?** | **`llmAppend`/`contentParts` default (model-visible)**; `context.mentions` opt-in for flows that read it |
| 5 | **Plugin composer API** | Add `openMentionMenu()`, `getMentions()`, `onMentionsChange` to `renderComposer` context |
| 6 | **Resolve timing** | **On select** (cached, abortable) so submit is instant; per-source `resolveOn:"submit"` for time-sensitive sources |
| 7 | **Discoverability** | **Ship a visible affordance button in v1** alongside the `@` trigger (same menu). Keyboard-only would gate adoption for non-technical users |
| 8 | **Menu anchoring** | **Composer element, opening upward** (`createPopover` `top-start`), not the caret — simpler, mobile-correct, no caret measurement |
| 9 | **Bundle cost when unused** | **Lazy sibling chunk** gated on `contextMentions.enabled` (mirrors `webmcp-polyfill.js`); core bundle pays only types (0 bytes) + a thin orchestrator. A runtime flag alone is insufficient — `--splitting false` ships static imports to everyone. See [Bundle strategy](#bundle-strategy-zero-cost-when-unused) |
| 10 | **Extension granularity** | Three levels: host **sources** (lowest effort); **`renderMentionMenu`/`renderMentionChip`** mid-level overrides (Persona behavior, your markup); **`renderComposer`** full replacement (highest effort) |

---

## Estimated scope

| Phase | Effort | Risk |
| --- | --- | --- |
| Phase 1 MVP | ~5–7 days | Low–Medium — keyboard precedence in one handler; resolve-on-select cache/abort lifecycle (caret-anchoring risk removed by composer-anchored menu); lazy-chunk wiring (well-trodden — three existing precedents to copy) |
| Phase 2 Polish | ~2–3 days | Low |
| Phase 3 Demo | ~1 day | Low |
| Phase 4 Contenteditable | ~1–2 weeks | High — voice, history, paste, a11y |

---

## Suggested first PR scope

Ship Phase 1 with one `createStaticMentionSource` demo source behind
`contextMentions.enabled: true`. That validates the **complete, good** loop —
button **or** `@` → instant menu → fuzzy filter → pill chip → resolve-on-select
→ instant send → model sees the context via `llmAppend` — without committing to
inline rich text, caret measurement, or `tokenRange`. Keep out of PR 1 anything
needing caret coordinates or contenteditable.

---

## Key files to read before coding

| File | Why |
| --- | --- |
| `packages/widget/src/components/composer-parts.ts` | `createComposerTextarea` (`data-persona-composer-input`); attachment row classes to mirror (chips are 48×48 — mentions are pills) |
| `packages/widget/src/ui.ts` | `handleSubmit` (~5471, keep synchronous), `handleComposerKeydown` (~5561, extend with menu-open branch), attachment wiring |
| `packages/widget/src/utils/attachment-manager.ts` | Chip row container + remove pattern to mirror for `ContextMentionManager` |
| `packages/widget/src/client.ts` | `buildAgentPayload` + `context` merge — mentions add an LLM-visible default path |
| `packages/widget/src/utils/composer-history.ts` | Up/Down history is text-only and `atStart`-gated — must not conflict with open menu; will not restore mentions |
| `packages/widget/src/plugin-kit.ts` | `createPopover()` — **element-anchored**, `top-start` + `matchAnchorWidth`, Shadow-DOM safe (no caret anchoring) |
| `packages/widget/src/webmcp-bridge.ts` | The reference for an **external dynamic import** — `import("@mcp-b/webmcp-polyfill")` gated on a flag; copy this shape for the lazy mention chunk |
| `packages/widget/src/index-global.ts` | Where the sibling-URL loaders for `webmcp-polyfill.js` / `runtype-tts` / `markdown-parsers` are registered — add the `context-mentions.js` loader here |
| `packages/widget/tsup.global.config.ts` | The `esbuildOptions.external` list that keeps optional chunks out of the IIFE bundle — add the mention chunk specifier alongside the existing three |
| `packages/widget/tsup.webmcp-polyfill.config.ts` | Template for the new `tsup.context-mentions.config.ts` standalone-chunk build |
