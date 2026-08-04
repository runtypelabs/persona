# Authoring Persona plugins

A plugin is the most powerful way to customize Persona's UI: it can take over any
rendered region (a message bubble, the launcher, the composer, an approval
prompt, the event stream) without forking the widget. This guide is the
authoring contract. For the wider map of *all* extension points, start at
[EXTENDING.md](./EXTENDING.md); for the current contribution path, see
[CONTRIBUTING.md](../../../CONTRIBUTING.md).

> **Source of truth.** The interface lives in
> [`src/plugins/types.ts`](../src/plugins/types.ts) and the registry in
> [`src/plugins/registry.ts`](../src/plugins/registry.ts). The hook signatures
> below mirror those files; if they ever drift, the source wins.

## The shape of a plugin

```ts
import { type AgentWidgetPlugin } from "@runtypelabs/persona";

const plugin: AgentWidgetPlugin = {
  id: "my-plugin",      // required and unique (re-registering the same id overwrites)
  priority: 10,         // optional, higher runs first (default 0)
  renderMessage(ctx) {  // zero or more render* hooks
    return null;        // null → fall through to the next plugin / the default
  },
  onRegister() {},      // optional lifecycle
  onUnregister() {},
};
```

Every render hook follows the same protocol:

- It receives a **context object** with the data it needs plus, for most hooks, a
  `defaultRenderer()` that produces the built-in element.
- **Return an `HTMLElement`** to take over that region.
- **Return `null`** to decline. Persona moves to the next plugin (by priority)
  and ultimately to the built-in renderer.
- Call **`defaultRenderer()`** to render the default and then wrap/augment it
  (add a badge, attach a listener) rather than rebuilding it from scratch.

> **`renderMessage` layout gotcha.** A render hook's output is inserted into a
> flex-row container. If your returned root is a short element, give it
> `width: 100%` (or it will collapse and the bubble can overflow oddly). This
> applies to bubble-level hooks specifically.

## Render hooks

| Hook | Region | Key context (beyond `config`) |
| --- | --- | --- |
| `renderSuggestion` | One starter or follow-up suggestion | `suggestion`, `surface`, `source`, `variant`, `defaultRenderer`, `select` |
| `renderMessage` | A message bubble | `message`, `defaultRenderer` |
| `renderWelcome` | The welcome surface (card, hero, home screen) | `config` (resolved), `variant`, `visible`, `defaultRenderer`, `sendMessage`, `requestRender`, `renderStarter`, `storage`, `onCleanup` |
| `renderLauncher` | The collapsed launcher button | `defaultRenderer`, `onToggle` |
| `renderHeader` | The panel header | `defaultRenderer`, `onClose?` |
| `renderComposer` | The input area | `defaultRenderer`, `onSubmit`, `streaming`, `openAttachmentPicker`, model controls, `onVoiceToggle?`, `requestRender`, `storage` |
| `renderReasoning` | A reasoning / chain-of-thought bubble | `message`, `defaultRenderer` |
| `renderToolCall` | A tool-call bubble | `message`, `defaultRenderer` |
| `renderAskUserQuestion` | The `ask_user_question` sheet | `payload`, `complete`, `resolve`, `dismiss` |
| `renderApproval` | An approval gate bubble | `message`, `defaultRenderer`, `approve`, `deny` |
| `renderLoadingIndicator` | The loading indicator | `LoadingIndicatorRenderContext` (`location`, `defaultRenderer`) |
| `renderIdleIndicator` | The idle-state indicator | `IdleIndicatorRenderContext` (`lastMessage`, `messageCount`) |
| `renderEventStreamView` | The whole event-stream view | `EventStreamViewRenderContext` |
| `renderEventStreamRow` | One event-stream row | `EventStreamRowRenderContext` |
| `renderEventStreamToolbar` | The event-stream toolbar | `EventStreamToolbarRenderContext` |
| `renderEventStreamPayload` | An expanded event payload | `EventStreamPayloadRenderContext` |

Most hooks are "return element or `null`". A few have richer protocols worth
calling out:

### Suggestion hooks

Suggestions expose a three-stage plugin pipeline:

1. `transformSuggestions({ suggestions, surface, source, config })` filters,
   ranks, reorders, or enriches the normalized configured/agent items. Hooks
   receive fully resolved suggestions and may return the loose shape (string
   shorthand included), which is re-normalized before the next hook. Every
   transform hook runs in priority order, and `maxItems` is applied afterward.
2. `renderSuggestion(...)` receives one normalized suggestion (including its
   effective `behavior`), plus `defaultRenderer()` and `select()`. Return any
   `HTMLElement`, or `null` for Persona's built-in chip/card/list item. Custom
   controls should call `select()` so unified/legacy DOM events, plugin
   selection hooks, and send/fill behavior all remain intact.
3. `onSuggestionSelect(...)` observes activation before the built-in action.
   Return `false` to cancel sending/filling. For integrations that do not use
   plugins, the bubbling `persona:suggestion:selected` DOM event is also
   cancelable with `event.preventDefault()`.

`persona:suggestion:shown` and `persona:suggestion:selected` are the events to
build against: they cover both surfaces and carry the normalized item. The
legacy `persona:suggestReplies:shown` / `persona:suggestReplies:selected` pair
still fires on the follow-up surface, but carries string payloads only, is not
cancelable, and is removed in 5.0. See
[DOM events](./UI-COMPONENTS.md#dom-events-1).

```ts
const suggestionsPlugin: AgentWidgetPlugin = {
  id: "product-suggestions",
  transformSuggestions: ({ suggestions }) =>
    suggestions.filter(canShow).map(addProductContext),
  renderSuggestion: ({ suggestion, select }) => {
    if (suggestion.emphasis !== "primary") return null;
    const card = buildProductCard(suggestion);
    card.addEventListener("click", select);
    return card;
  },
  onSuggestionSelect: ({ suggestion, surface, source }) => {
    analytics.track("suggestion_selected", { suggestion, surface, source });
  },
};
```

The context distinguishes `surface: "starter" | "followUp"` and
`source: "config" | "agent" | "host"`, so one plugin can render the welcome
state, agent-produced `suggest_replies`, and host-pushed
`controller.setFollowUpSuggestions` items differently. Use `injectStyles` from
the plugin kit for custom UI that also works under Shadow DOM.

#### Transform recipes

The `suggest_replies` schema advertises semantics only (`label`, `prompt`,
`description`). Presentation is the host's, and `transformSuggestions` is where
it is applied. Hooks receive resolved items, so these are plain object spreads
with no string unwrapping.

Add icons by keyword:

```ts
const iconFor = (label: string) =>
  /price|plan|billing/i.test(label) ? "dollar-sign" : "message-circle";

transformSuggestions: ({ suggestions }) =>
  suggestions.map((s) => ({ ...s, icon: s.icon ?? iconFor(s.label) })),
```

Mark the first item primary:

```ts
transformSuggestions: ({ suggestions }) =>
  suggestions.map((s, index) => ({
    ...s,
    emphasis: index === 0 ? "primary" : s.emphasis,
  })),
```

Switch long prompts to fill so the user can edit before sending, agent items
only:

```ts
transformSuggestions: ({ suggestions, source }) =>
  source === "agent"
    ? suggestions.map((s) =>
        s.prompt.length > 120 ? { ...s, behavior: "fill" } : s
      )
    : suggestions,
```

Unknown icon names degrade gracefully: `renderLucideIcon` warns and the item
renders without an icon.

### `renderWelcome`

The welcome surface is the first-open experience: greeting, starters, and
whatever a home screen, pre-chat form, or help-search card needs. The first
plugin returning an element wins; returning `null` falls through to Persona's
default welcome, same contract as `renderSuggestion`.

The core owns the welcome host. It stays mounted for the panel's lifetime and
content is swapped inside it, so plugins never remove or re-create it:

- `requestRender()` runs your registered cleanups, drops the previous plugin
  element, and re-runs arbitration with a fresh context. Attach listeners to the
  element you return (they go away with it) or register teardown via
  `onCleanup(fn)`.
- `visible` is the derived visibility for this render (welcome visibility is
  derived from the session, never stored). It governs the **default renderer
  only**: a plugin element renders regardless, and while it is active the host
  carries `data-persona-welcome-overlay` and covers the messages area. That is
  what makes "return to home over an existing transcript" work: after a user
  message `visible` is `false`, but your `requestRender()` still renders your
  stack over the conversation until you return `null` again.
- The overlay host is full-bleed, so your element owns its own column, and
  wide panels stretch it edge to edge unless you cap it. The widget root
  publishes the resolved columns as CSS variables, so match them without any
  config access: `max-width: var(--persona-welcome-max-width, 640px);
  margin-inline: auto` for welcome-shaped content, and
  `var(--persona-content-max-width, 768px)` for composer or transcript-shaped
  content (it tracks `layout.contentMaxWidth`, including `controller.update()`
  changes). The pre-chat and home screen example plugins show the pattern.
  The same applies to `renderComposer` content, which bypasses the default
  form's column styling.
- `defaultRenderer()` returns the live default card, so composing is
  `const card = ctx.defaultRenderer(); card.appendChild(mySearchBox); return card;`.
  Composition is not a takeover: derived visibility still applies and no overlay
  is set. Remove what you appended in `onCleanup` so a re-render doesn't stack
  duplicates.
- `renderStarter(suggestion)` builds a starter through the full select pipeline:
  `onSuggestionSelect` hooks, the cancelable `persona:suggestion:*` events, and
  send/fill semantics. Use it instead of wiring your own click handler to
  `sendMessage`.
- `config` is the alias-resolved welcome config (`welcome.*` wins per field,
  then the legacy `copy.welcome*`, then the built-in default), never the raw
  `copy` shape.

```ts
const homeScreen: AgentWidgetPlugin = {
  id: "home-screen",
  renderWelcome: ({ config, renderStarter, requestRender, storage, onCleanup }) => {
    if (storage.get("view") === "chat") return null; // transcript is visible

    const root = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = config.title;
    root.appendChild(title);

    for (const prompt of ["Track my order", "Start a return"]) {
      root.appendChild(renderStarter(prompt));
    }

    const startChat = document.createElement("button");
    startChat.textContent = "Start a conversation";
    startChat.addEventListener("click", () => {
      storage.set("view", "chat");
      requestRender();
    });
    root.appendChild(startChat);

    onCleanup(() => startChat.remove());
    return root;
  },
};
```

### `ctx.storage`

`renderWelcome` and `renderComposer` both receive the same synchronous store,
keyed `` `${persistState.keyPrefix ?? "persona-"}plugin:<plugin.id>:<key>` ``. It
is backed by `localStorage` directly: the async `storageAdapter` cannot back a
synchronous API, and `persistState` is not a general key-value surface.
`persistState: false` downgrades it to a per-instance in-memory map, and blocked
storage (Safari private mode, partitioned iframes) does the same rather than
throwing.

Values land in plain `localStorage`. A plugin handling data it considers
sensitive should take its own storage implementation as a plugin option instead
of defaulting into `ctx.storage`.

### Reaching the controller from a plugin

No render context carries the controller: plugins are host-instantiated, so the
sanctioned pattern is a factory that closes over the init handle.

```ts
import { initAgentWidget, type AgentWidgetPlugin } from "@runtypelabs/persona";

const createPreChatPlugin = (options: { fields: string[] }) => {
  let controller: ReturnType<typeof initAgentWidget> | null = null;

  const plugin: AgentWidgetPlugin & {
    attach: (handle: ReturnType<typeof initAgentWidget>) => void;
  } = {
    id: "pre-chat",
    attach: (handle) => {
      controller = handle;
    },
    renderWelcome: ({ storage, requestRender }) => {
      if (storage.get("identity")) return null;
      const form = document.createElement("form");
      // ...build `options.fields`...
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        storage.set("identity", JSON.stringify({ name: "Ada" }));
        controller?.injectSystemMessage("Visitor: Ada");
        requestRender();
      });
      return form;
    },
  };

  return plugin;
};

const plugin = createPreChatPlugin({ fields: ["name", "email"] });
const controller = initAgentWidget({ plugins: [plugin], apiUrl: "/api/chat" });
plugin.attach(controller);
```

### `renderComposer`

`streaming` is `true` exactly when the assistant stream is active (the same
moment `session.isStreaming()` becomes true). Prefer wiring controls to
`data-persona-composer-disable-when-streaming` plus the host's
`setComposerDisabled`, or react to
`footer.dataset.personaComposerStreaming === "true"`. (`disabled` is a
deprecated alias for the legacy single-submit-button behavior.) The context also
hands you `openAttachmentPicker()`, the model list / `selectedModelId` /
`onModelChange` from `config.composer`, and `onVoiceToggle()` when
`config.voiceRecognition.enabled` is true.

A plugin-returned composer owns its copy: the core does not stamp
`copy.inputPlaceholder` or `copy.sendButtonLabel` onto plugin-rendered content,
so set your own placeholder (the pre-chat gate keeps its lock reason there).
Composition via `defaultRenderer()` still receives the configured copy.

The hook runs once when the panel is constructed, so `requestRender()` is how a
composer plugin re-renders later: it re-runs arbitration and swaps the footer in
place. Returning `null` on that second pass hands the composer back to Persona,
which is how a pre-chat gate unlocks. The core re-binds everything attached to
the footer: composer listeners, the submit handler, the mic, the attachment
input (pending attachments and their previews survive), the mention context row
and affordance buttons, and the composer suggestion row; the composer text is
carried over. Uncommitted mention chips are cleared, because the mention runtime
is bound to the outgoing input element.

### `renderAskUserQuestion`

This hook owns the interactive sheet for the built-in `ask_user_question` tool
(**not** the answered state). You get a pre-parsed `payload` that may still be
partial while the tool call streams (check `complete`), and two callbacks:
`resolve(answer)` resumes the paused LOCAL tool and appends a user-visible answer bubble, and
`dismiss()` cancels with the sentinel `"(dismissed)"` so the server doesn't sit
in `waiting_for_local` forever. Returning an element suppresses the built-in
composer-overlay sheet; returning `null` falls back to it.

### `renderApproval`

An approval is a single binary gate, so there are exactly two outcomes:
`approve()` and `deny()`. Pass `{ remember: true }` to flag an "Always
allow/deny" affordance. The *current* approval resolves identically either way,
but the flag is forwarded to `config.approval.onDecision` so you can persist a
don't-ask-again policy yourself. The hook is **called again whenever the
approval's status changes**, so branch on `message.approval?.status` to render
the resolved state (and tear down any global listeners you added while pending).

## Registration: global vs per-instance

There are two ways to register, governed by
[`registry.ts`](../src/plugins/registry.ts):

```ts
import { pluginRegistry } from "@runtypelabs/persona";

// Global: applies to every widget instance on the page.
pluginRegistry.register(plugin);
pluginRegistry.unregister("my-plugin");

// Per-instance: only this widget. Instance plugins override global ones with
// the same id.
initAgentWidget({ config: { plugins: [plugin] } });
```

**Priority & ordering.** `getAll()` sorts by `priority` descending (default `0`).
For a given region, plugins are tried highest-priority first; the first to return
a non-`null` element wins. Per-instance plugins are merged over globals by `id`,
then the merged list is re-sorted by priority.

**Lifecycle.** `onRegister()` fires when the plugin enters the registry;
`onUnregister()` fires on `unregister(id)` or `clear()`. Use them to set up and
tear down anything global (document listeners, observers, injected styles you
manage manually).

## The plugin kit

Two needs come up in almost every non-trivial plugin, and both are easy to get
subtly wrong. They're solved by the optional, dependency-free
**`@runtypelabs/persona/plugin-kit`** subpath (source:
[`src/plugin-kit.ts`](../src/plugin-kit.ts)). Importing it costs nothing unless
you use it, and it never touches the widget's core bundle.

### `injectStyles`: Shadow-DOM-safe CSS

A `<style>` appended to `document.head` does **not** pierce a shadow root, so a
plugin that styles its element breaks the moment the widget runs with
`useShadowDom: true`. `injectStyles` resolves the correct root (shadow root when
shadowed, document head otherwise), is **idempotent** (keyed by id, safe to call
on every render), and handles the detached-then-mounted case for you.

```ts
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

renderApproval: ({ message, approve, deny }) => {
  const card = buildCard(message.approval, approve, deny);
  injectStyles(card, "my-approval-plugin", CSS); // pass the element you'll return
  return card;
};
```

`getStyleRoot(node)` is the lower-level primitive if you need the resolved
`Document | ShadowRoot` yourself.

### `createPopover`: floating UI that isn't clipped

Menus, dropdowns, and tooltips inside a plugin must overlay the rest of the
widget and escape the transcript's scroll clipping. `createPopover` gives you a
`fixed`-positioned popover that dismisses on outside pointerdown, repositions on
scroll/resize, auto-closes when its anchor leaves the DOM, and mounts into the
right style + stacking scope (shadow root when shadowed, `document.body`
otherwise).

```ts
import { createPopover } from "@runtypelabs/persona/plugin-kit";

const popover = createPopover({
  anchor: splitButton,
  content: menu,
  placement: "bottom-start",
  matchAnchorWidth: true,
});
caret.addEventListener("click", () => popover.toggle());
// on teardown: popover.destroy();
```

Positioning options:

- `placement`: `"bottom-start"` (default), `"bottom-end"`, `"top-start"`, or
  `"top-end"`, relative to the anchor.
- `offset`: gap in px between the anchor and the content. Default `6`.
- `matchAnchorWidth`: set the content's `min-width` to the anchor's width.
- `horizontalOffset`: a `() => number | null` callback for `*-start`
  placements. Return the desired left offset in px measured from the anchor's
  left edge, or `null` for plain anchor alignment. When present, the content is
  content-sized, capped to the anchor's width, and clamped so it never
  overflows the anchor's edges. This is how the inline mention menu follows the
  `@` glyph.
- `verticalOffset`: a `() => number | null` callback for `top-*` placements.
  Return the anchor point's top offset in px measured from the anchor's top
  edge, or `null` to use the anchor's top edge. This is how the inline mention
  menu anchors above the line containing the `@` instead of the whole composer.

Both offset callbacks are re-invoked on every reposition (scroll and resize),
so return a cached value rather than measuring layout inside them.

`isEditableEventTarget(event)` rounds out the kit. Use it to avoid hijacking
keys like Enter/Escape while the user types in the composer (it inspects the
composed path, so it works across the Shadow-DOM boundary).

## Worked examples

Example plugins ship in the showcase app. Each is a single file with no
dependency beyond the plugin-kit subpath, and is written to be **copied into your
own app**:

- [`suggestion-showcase-plugins.ts`](../../../apps/web/src/plugins/suggestion-showcase-plugins.ts):
  **`transformSuggestions` / `renderSuggestion` / `onSuggestionSelect`**:
  compares data-only enrichment with a fully custom starter/follow-up UI.
- [`ask-horizontal-pills-plugin.js`](../../../apps/web/src/plugins/ask-horizontal-pills-plugin.js):
  **`renderAskUserQuestion`**: renders the answer sheet as horizontal pill buttons
  with a free-text option and a multi-question stepper.
- [`voice-indicator-plugin.js`](../../../apps/web/src/plugins/voice-indicator-plugin.js):
  **`renderMessage`**: in-thread voice states (transcribing, thinking) with
  animated bubbles, falling through to the default renderer for everything else.
- [`approval-actions-plugin.js`](../../../apps/web/src/plugins/approval-actions-plugin.js):
  **`renderApproval`**: an alternative permission prompt with a split "Always allow
  / Allow once" control, keyboard shortcuts, and per-status rendering, built on
  the plugin kit's `injectStyles`.

## Contributing a plugin

When your plugin is reusable, please contribute it to this monorepo while Persona
is launching. Good homes include showcase demos, example apps, docs, or package
source changes. If the right location is not obvious, open a draft PR and
maintainers can help place it.
