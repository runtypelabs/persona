---
"@runtypelabs/persona": minor
---

Skills / slash-commands: the context-mentions engine supports multiple trigger channels, so a `/`-command menu can run alongside `@`-context mentions on the same (lazy-loaded) runtime.

- **Multi-trigger channels.** New `contextMentions.triggers[]` adds extra channels beside the primary `@`. Each channel has its own `trigger`, `sources`, `triggerPosition` (`"anywhere" | "line-start" | "input-start"`), and `allowSpaces` (multi-word queries for command args). The single-trigger config is channel 0; `triggerPosition` is also available on the primary channel.
- **Commands are verbs.** Mention items may carry `command: "prompt" | "action" | "server"`:
  - `"prompt"` — `resolve()` returns `insertText` (or `llmAppend`), written into the composer per `insertMode` (`"replace"` | `"insert-at-caret"`); `submitOnSelect` sends it immediately. No chip.
  - `"action"` — runs `item.action({ args, config, messages, composer })` in the browser; no chip, no message sent.
  - `"server"` — routed like a `resolveOn: "submit"` mention whose `resolve().context` reaches the backend via request `context.mentions.<sourceId>.<itemId>`. No new wire field or backend change required.
- **Args and inline completion (Slack-style).** Text after the command name is captured as `args` and passed to `resolve()`/`action()` (`/deploy staging` → `args: "staging"`). A command with `argsPlaceholder` (shown as a `‹hint›` in the menu row) — and every `kind: "server"` command — completes inline: selecting it fills `/name ` into the composer, the user types the argument, and the command runs at send time. Zero-arg commands still run on select.
- **Helper.** New exported `createSlashCommandsSource({ id, label, commands })` builds a command source that matches on the command name and maps `SlashCommandDefinition`s to items. New public types: `AgentWidgetMentionTriggerChannel`, `AgentWidgetMentionTriggerPosition`, `AgentWidgetContextMentionCommandContext`, `AgentWidgetContextMentionComposerCapability`, and the now-exported `AgentWidgetContextMentionItemRenderContext`.
- **Bundle.** All command runtime ships in the existing lazy `context-mentions.js` chunk; the core CDN bundle is unchanged. A per-channel affordance button is only painted for channels with sources that opt into `showButton` (extra channels default to typed-trigger only).
