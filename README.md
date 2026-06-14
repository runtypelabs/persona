# Persona

[![npm](https://img.shields.io/npm/v/@runtypelabs/persona?style=flat&color=262626&label=npm)](https://www.npmjs.com/package/@runtypelabs/persona)
[![Live demo](https://img.shields.io/badge/live_demo-persona--chat.dev-0d9488?style=flat)](https://persona-chat.dev)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/runtypelabs/persona)

A themeable, pluggable AI chat widget for websites: built in Typescript with zero framework dependencies. It renders using Vanilla JS.

Persona gives you a drop-in UI for your AI assistant that works on basically any site or product on the web. It ships with support for streaming responses, direct client-token installs, WebMCP/page tools, built-in local client tools, voice I/O, multi-modal content, tool call visualization, approval gates, artifact rendering, safe markdown/HTML rendering, and a plugin system so you can customize every layer of the UI.

Persona works with any SSE-capable backend. It's pre-integrated with [Runtype](https://runtype.com) out of the box, so you can go from install to a live assistant with a `clientToken`, or route through `@runtypelabs/persona-proxy` when you need server-side API-key control.

## Live demo

**[persona-chat.dev](https://persona-chat.dev)** hosts the interactive gallery (35+ pages): streaming chat, voice, docked and fullscreen layouts, themes, tool calls, artifacts, and more. It mirrors [`examples/embedded-app`](./examples/embedded-app). To run the same pages on your machine with hot reload while you edit code, run `pnpm dev` from the repository root: the Vite dev server reloads the demo, and the app resolves `@runtypelabs/persona` from the workspace (`packages/widget`), so widget changes apply without publishing to npm.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`packages/widget`](./packages/widget) | `@runtypelabs/persona` | The installable chat widget |
| [`packages/proxy`](./packages/proxy) | `@runtypelabs/persona-proxy` | Optional Hono-based proxy server for flow configuration |

## Examples

| Example | Platform | Description |
|---------|----------|-------------|
| [`examples/embedded-app`](./examples/embedded-app) | Vite | Vanilla JS demo with runtime configuration ([live](https://persona-chat.dev)) |
| [`examples/ai-sdk-webmcp`](./examples/ai-sdk-webmcp) | Next.js | WebMCP page tools on a direct Vercel AI SDK backend, no Runtype ([live](https://ai-sdk-webmcp.persona-chat.dev)) |
| [`examples/vercel-edge`](./examples/vercel-edge) | Vercel / Railway / Fly.io | Node.js proxy server |
| [`examples/cloudflare-workers`](./examples/cloudflare-workers) | Cloudflare Workers | Edge proxy server |

## Quick Start

```bash
corepack enable
pnpm install
pnpm dev
```

This starts the proxy on `http://localhost:43111` and the demo app at `http://localhost:5173`. Both depend on the local widget package via workspace linking, so changes hot-reload without publishing.

> **Note:** Requires Node.js 20+ (`nvm use` reads `.nvmrc`). Corepack manages pnpm for you.

### Install from npm

```bash
npm install @runtypelabs/persona        # widget
npm install @runtypelabs/persona-proxy   # proxy (optional)
```

## Features

Everything below is opt-in and configurable via the widget config, feature flags, or the plugin system.

### Streaming Chat
SSE-based message streaming with pluggable parsers (plain text, JSON, XML, regex). Bring your own stream parser or use the built-ins. Supports partial JSON parsing for incomplete chunks, configurable dispatch-failure copy via `errorMessage`, and optional stream reveal animations (`typewriter`, `letter-rise`, `word-fade`, `wipe`, `glyph-cycle`, `pop-bubble`, or custom plugins).

### Multi-Modal Content
Text, images (PNG, JPEG, GIF, WebP, SVG), and documents (PDF, DOCX, TXT, CSV, JSON, Excel). Configure allowed file types, size limits, and previews through the attachments config.

### Voice Input & Output
Optional speech-to-text via the Web Speech API or Runtype's WebSocket voice service with barge-in interruption and voice activity detection. Text-to-speech playback for assistant responses — auto-speak via `textToSpeech`, or a per-message "Read aloud" button with play/pause/resume via `messageActions.showReadAloud`. TTS is backed by a pluggable `SpeechEngine` (browser Web Speech API by default, or a hosted engine via `textToSpeech.createEngine`). Enable via `voiceRecognition` and `textToSpeech`.

### Reasoning & Extended Thinking
Collapsible reasoning bubbles that display model chain-of-thought with duration tracking and streaming. Controlled by `features.showReasoning`: on by default, or override the renderer with a plugin hook.

### Tool Calls, Approvals & Local Client Tools
Expandable tool call bubbles showing name, status, arguments, and results, with compact display modes, active previews, grouping, and loading animations. Optional human-in-the-loop approval bubbles include friendly summaries, hidden/collapsed technical details, agent-stated reasons, and custom approve/deny handlers. Built-in LOCAL client tools (`ask_user_question` and `suggest_replies`) can be advertised from the widget with `features.askUserQuestion.expose` and `features.suggestReplies.expose`.

### Artifacts
Optional side-panel for rendering markdown and component content. Desktop split layout (resizable) or mobile drawer. Enable via `features.artifacts`, configure toolbar presets, copy behavior, and appearance.

### Event Stream Inspector
Optional real-time event capture with search/filter, badge coloring, timestamps, expandable payloads, and output-throughput diagnostics. Enable via `features.showEventStreamToggle`. Customize rows, toolbar, and payload rendering through plugin hooks.

### Composer, Scrolling & Keyboard Shortcuts
`Enter` sends a message (`Shift+Enter` for a newline) and is inert while a response is streaming: it never interrupts generation. Press `Esc` within the widget to stop an in-flight response (the visible Stop button does the same). `Up`/`Down` navigate previously sent messages for quick re-entry or editing : entered only when the caret is at the start of the input, so multi-line editing is preserved, and your in-progress draft is restored when you page back to the present. History navigation is on by default; disable via `features.composerHistory: false`. Streaming scroll behavior is configurable with `features.scrollBehavior` (`follow`, `anchor-top`, or `none`), and the shared scroll-to-bottom affordance shows a new-message count while you're scrolled away.

### Themes & Styling
Light and dark themes included. Full design token system (palette, semantic, component-level) with CSS variable support. Extend with built-in plugins for accessibility, reduced motion, high contrast, and branding, or create your own.

### Layout, Docking & Fast Script Installs
Start from a built-in preset (shop, minimal, fullscreen) or configure from scratch. Header layouts, message layouts, avatars, timestamps, and slot-based rendering are all customizable. Dock as a floating widget, wrap a page region with a side panel (`resize`, `emerge`, `overlay`, or `push` reveals with a `dock.maxHeight` viewport guard), or embed inline. Script-tag installs paint a tiny real launcher first and defer the full panel bundle until first open when the config allows it.

### Plugin System
14 render hooks covering the launcher, header, composer, messages, reasoning, tool calls, ask-user-question sheets, approvals, loading/idle indicators, and the event stream. Priority-based ordering with automatic fallback to defaults. Replace any piece of the UI without forking; use the optional `@runtypelabs/persona/plugin-kit` helpers for Shadow-DOM-safe styles and popovers.

### Feedback & Analytics
Optional message-level upvote/downvote/copy with automatic backend submission in client-token mode. CSAT and NPS survey components. Script-tag lifecycle callbacks/events (`onScriptLoad`, `onLauncherShown`, `onChatReady`, `onError`) and controller events make it easy to wire custom analytics.

### Agent Execution
Renders multi-turn agent loops as they stream from the backend: displaying iteration progress, reflections, and stop reasons. Agent metadata is attached to every message. Customize how execution events appear through plugin hooks.

### Component System
Register custom components and render them inline via directives. Stream-aware parser and middleware support dynamic UI insertion during streaming, with live DOM element hydration so event listeners survive transcript re-renders.

### Message Injection, Context & Page Tools
Programmatically insert messages (`injectMessage`, `injectAssistantMessage`, `injectUserMessage`, `injectSystemMessage`) with dual-content support: display one thing to the user while sending different content to the LLM. Inject page/editor context with `contextProviders` and `requestMiddleware`; use `webmcp: { enabled: true }` to expose page actions through `document.modelContext`. For richer page context, import the optional `@runtypelabs/persona/smart-dom-reader` provider.

## Proxy Deployment

Both proxy examples handle secure API key management, CORS, and multiple flow configurations.

- **vercel-edge**: best for quick deployment to Vercel or any Node.js host
- **cloudflare-workers**: best for global edge deployment with low latency

## Publishing

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management.

```bash
pnpm changeset            # create a changeset after making changes
pnpm changeset version    # bump versions and generate changelogs
pnpm release              # build and publish to npm
```

See [`packages/widget/README.md`](./packages/widget/README.md) for the full configuration reference.

## License

MIT
