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

## The 14 render hooks

| Hook | Region | Key context (beyond `config`) |
| --- | --- | --- |
| `renderMessage` | A message bubble | `message`, `defaultRenderer` |
| `renderLauncher` | The collapsed launcher button | `defaultRenderer`, `onToggle` |
| `renderHeader` | The panel header | `defaultRenderer`, `onClose?` |
| `renderComposer` | The input area | `defaultRenderer`, `onSubmit`, `streaming`, `openAttachmentPicker`, model controls, `onVoiceToggle?` |
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

`isEditableEventTarget(event)` rounds out the kit. Use it to avoid hijacking
keys like Enter/Escape while the user types in the composer (it inspects the
composed path, so it works across the Shadow-DOM boundary).

## Worked examples

Three example plugins ship in the showcase app. Each is a single file with no
dependency beyond the plugin-kit subpath, and is written to be **copied into your
own app**:

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
