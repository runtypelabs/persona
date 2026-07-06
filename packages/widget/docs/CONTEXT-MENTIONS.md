# Context Mentions

Context mentions let users pull external context into a single message by
typing `@` (or clicking a composer button) and picking an item from a searchable
menu. The selected item's content reaches the model alongside the typed prose.

Typical uses: files, docs, orders, tickets, page elements, or any host data the
model should see for one turn.

```ts
import initAgentWidget, { createStaticMentionSource } from "@runtypelabs/persona";

initAgentWidget({
  config: {
    contextMentions: {
      enabled: true,
      sources: [
        createStaticMentionSource({
          id: "files",
          label: "Files",
          items: [{ id: "app", label: "App.tsx", iconName: "file-code" }],
          resolve: (item) => ({
            llmAppend: `Contents of ${item.label}:\n${readFile(item.id)}`,
          }),
        }),
      ],
    },
  },
});
```

The feature is disabled by default. When enabled, the menu and chip runtime is
lazy-loaded on first use (about 15 kB gzipped), so installs that leave it off
ship only a small affordance.

Live demos: [chip mode](https://persona-chat.dev/context-mentions-demo.html) and
[inline mode](https://persona-chat.dev/context-mentions-inline-demo.html).

## How it works

1. The user types `@` (or clicks the composer button). The menu opens instantly.
2. Each keystroke filters the menu by calling every source's `search()`.
3. Picking an item calls the source's `resolve()`, which returns the content to
   send to the model.
4. On send, the resolved content is prepended to the message the model sees.
   The transcript shows only what the user typed, plus a chip or token for the
   mention.

## Sources

A source is one group in the menu. It has an `id`, a `label` (the group
header), a `search()` function, and a `resolve()` function.

```ts
const ordersSource = {
  id: "orders",
  label: "Orders",
  // Filter items for the current query. Empty query means "show recents".
  search: async (query, { signal }) => {
    const res = await fetch(`/api/orders?q=${query}`, { signal });
    const orders = await res.json();
    return orders.map((o) => ({ id: o.id, label: o.number, iconName: "package" }));
  },
  // Fetch the content for a picked item.
  resolve: async (item) => {
    const order = await fetchOrder(item.id);
    return { llmAppend: `Order ${item.label}:\n${JSON.stringify(order, null, 2)}` };
  },
};
```

For a static in-memory list, use `createStaticMentionSource`. It wires
`search()` to the built-in fuzzy matcher (`defaultMentionFilter`), which ranks
prefix matches first, then word-boundary matches, then subsequence matches, and
boosts items with a higher `recencyScore`.

### When `resolve()` runs

| `resolveOn` | Behavior |
| --- | --- |
| `"select"` (default) | Resolves as soon as the user picks the item. The fetch runs while the user finishes typing, so send stays instant. The result is cached on the chip and aborted if the chip is removed. |
| `"submit"` | Resolves at send time. Use for time-sensitive content, like the current state of a page element that may change between pick and send. |

If `resolve()` throws or aborts, the mention is dropped, the message still
sends, and `onMentionResolveError` fires so you can show a notice.

## How resolved content reaches the model

`resolve()` returns a payload with up to three channels:

| Channel | Reaches the model? | Use for |
| --- | --- | --- |
| `llmAppend` | Yes, always. Prepended to the message's model-visible content. | Lead with this. It works with no backend changes. |
| `contentParts` | Yes, via the multi-modal path. | Images or file parts. |
| `context` | Only if your backend reads it. Merged into the request `context` under `mentions.<sourceId>.<itemId>`. | Structured data for flows or agents that consume it server-side. |

### Formatting the model-visible block (`llmFormat`)

Each mention's `llmAppend` text is wrapped in a delimited block before being
prepended. Blocks are joined with blank lines, and the typed prose comes last.

| `llmFormat` | Output |
| --- | --- |
| `"fenced"` (default) | A fenced code block with the label in the info string. The fence auto-escalates to four or more backticks when the body itself contains a fence, so content can never break out of its wrapper. |
| `"document"` | Anthropic's indexed `<document><source>...</source><document_content>...` shape. Recommended for prose or document content per Anthropic's long-context guidance. |
| function | `(entry, index) => string`. Your return value is used verbatim for that mention. If it throws, that entry falls back to the fenced format. |

## Display modes

`display` controls how a picked mention appears in the composer and in the sent
bubble. The model-visible channel is identical in both modes.

### `"chip"` (default)

Picking an item strips the typed `@query` and adds a compact removable pill in
a context row above the composer text. The message text stays prose-only.

### `"inline"`

Picking an item inserts an atomic styled token directly in the sentence, the
way Slack, Linear, and Cursor do. The composer becomes a contenteditable
surface, loaded as a separate lazy chunk (about 3 kB gzipped) only when this
mode is configured.

```ts
contextMentions: {
  enabled: true,
  display: "inline",
  sources: [...],
}
```

Differences from chip mode:

- Tokens sit in the sentence and delete as one unit (backspace removes the
  whole token).
- The same item can be mentioned more than once. Each pick inserts its own
  token; the resolved payload is deduplicated so the model receives the content
  once.
- Sent bubbles render the tokens in place. There is no separate chip row.
- Tokens can be tinted per item via `item.color`, or per source via CSS using
  the token's `[data-mention-source]` attribute.
- Composer history recall (up arrow) restores the message as plain text, not
  live tokens. This is a known limitation.
- `renderMentionChip` is ignored for `@` mentions; use `renderMentionToken`
  instead.

## Menu behavior and positioning

Menu placement is automatic. There is no configuration option for x/y offsets
or the gap, and CSS cannot move the menu (its `top` and `left` are set inline
with fixed positioning). The `renderMentionMenu` override supplies the menu's
markup only; the widget always owns positioning.

- **Chip mode:** the menu is anchored to the composer. It opens upward, spans
  the composer's full width, and sits 6 px above it.
- **Inline mode:** the menu is anchored to the `@` glyph itself. Its left edge
  lines up with the `@`, clamped so it never overflows the composer's edges (a
  trigger near the right edge shifts the menu left to fit, as in Slack).
  Vertically it sits 6 px above the line containing the `@`, not above the
  whole composer, so a trigger on a later line keeps the menu next to the text.
- The anchor is measured once when the menu opens, not on every keystroke, so
  typing the query never moves the menu. It re-measures when the trigger moves
  (a new `@` session) and when the composer grows on line wrap.
- In right-to-left composers, inline mode falls back to composer-left
  horizontal alignment; vertical line anchoring still applies.

What you can control:

- The menu's max height, via the `--persona-mention-menu-max-height` CSS
  variable (default `280px`).
- The menu's appearance, via CSS or the render overrides below.

## The composer button

By default a visible "+" button appears in the composer (`showButton: true`).
Clicking it opens the same menu as a picker with an in-menu search field, and no
trigger character is inserted into the composer. This is the discoverable entry
point; the bare `@` trigger alone is hard to find for non-technical users.

| Option | Default | Description |
| --- | --- | --- |
| `showButton` | `true` | Show the affordance button. |
| `buttonIconName` | `"plus"` | Any registered Lucide icon. Use `"at-sign"` for developer-facing surfaces. |
| `buttonTooltipText` | `"Add context"` | Tooltip and aria-label. |
| `searchPlaceholder` | `"Search context…"` | Placeholder for the picker's search field. |

## Slash commands

The same engine can drive additional trigger characters. The common case is a
`/` channel for commands (verbs that run behavior) next to `@` for context
(nouns that attach content).

```ts
import { createSlashCommandsSource } from "@runtypelabs/persona";

contextMentions: {
  enabled: true,
  sources: [...mentionSources],
  triggers: [{
    trigger: "/",
    triggerPosition: "line-start",
    sources: [createSlashCommandsSource({
      id: "cmd",
      label: "Commands",
      commands: [
        { name: "summarize", kind: "prompt", prompt: "Summarize this conversation." },
        { name: "clear", kind: "action", action: ({ composer }) => composer.setValue("") },
        { name: "lookup", kind: "server", argsPlaceholder: "order id",
          data: (args) => ({ orderId: args }) },
      ],
    })],
  }],
}
```

Command kinds:

| `kind` | What selecting it does |
| --- | --- |
| `"prompt"` (default) | Writes text into the composer (a macro). Set `submitOnSelect: true` to send immediately. |
| `"action"` | Runs a browser-side handler. No message is sent. |
| `"server"` | Sends structured data to your backend via request `context.mentions`. |

A command with `argsPlaceholder` (and every `"server"` command) completes
inline: selecting it fills `/name ` into the composer, the user types the
argument, and the command runs at send time with those args, Slack-style.

## Render overrides

Four hooks customize appearance while the widget keeps the behavior (trigger
detection, search, debounce, keyboard navigation, positioning):

| Hook | Scope |
| --- | --- |
| `renderMentionMenu` | The whole menu. You paint groups and rows from the provided context and call `ctx.select(item)` / `ctx.close()`. Positioning stays with the widget. |
| `renderMentionItem` | One result row's inner content, keeping the built-in menu chrome, group headers, and keyboard navigation. Ignored when `renderMentionMenu` is set. |
| `renderMentionChip` | One composer chip (chip mode). Must include an accessible remove control wired to `ctx.remove`. |
| `renderMentionToken` | One inline token (inline mode), in both the composer and the sent bubble. |

## Callbacks

| Callback | Fires when |
| --- | --- |
| `onMentionRejected(item, reason)` | A pick is rejected: `"duplicate"` (chip mode only), `"limit"` (hit `maxMentions`), or `"stale"` (inline mode; the composer changed between parse and commit). |
| `onMentionResolveError(item, error)` | A `resolve()` threw or aborted. The mention is dropped and the message still sends. |

## Limits and tuning

| Option | Default | Description |
| --- | --- | --- |
| `trigger` | `"@"` | The primary trigger character. |
| `triggerPosition` | `"anywhere"` | Where the trigger may open: `"anywhere"`, `"line-start"`, or `"input-start"`. |
| `maxMentions` | `8` | Max mentions per message. |
| `maxItemsPerGroup` | `6` | Max rows per source group before a "keep typing" hint. |
| `searchDebounceMs` | `150` | Debounce for async source search only. Synchronous sources and the first paint are never debounced. |
| `chipIconName` | `"at-sign"` | Chip icon fallback when a source or item omits one. |

## Related docs

- [Configuration Reference](./CONFIGURATION-REFERENCE.md): the full
  `contextMentions` option table.
- [Authoring Plugins](./PLUGINS.md): the plugin-kit `createPopover` helper, if
  you are building your own floating UI.
- [Extending Persona](./EXTENDING.md): the map of all extension points.
