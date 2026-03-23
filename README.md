# Persona

[![npm](https://img.shields.io/npm/v/@runtypelabs/persona?style=flat&color=262626&label=npm)](https://www.npmjs.com/package/@runtypelabs/persona)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/runtypelabs/persona)

A themeable, pluggable streaming AI chat widget for websites — built in plain JS with zero framework dependencies.

Persona gives you a drop-in UI for your AI assistant that works on any site. It ships with support for streaming responses, voice I/O, multi-modal content, tool call visualization, artifact rendering, and a plugin system so you can customize every layer of the UI.

Persona works with any SSE-capable backend. It's pre-integrated with [Runtype](https://runtype.com) out of the box, so you can go from install to live assistant with zero configuration.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`packages/widget`](./packages/widget) | `@runtypelabs/persona` | The installable chat widget |
| [`packages/proxy`](./packages/proxy) | `@runtypelabs/persona-proxy` | Optional Hono-based proxy server for flow configuration |

## Examples

| Example | Platform | Description |
|---------|----------|-------------|
| [`examples/embedded-app`](./examples/embedded-app) | Vite | Vanilla JS demo with runtime configuration |
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
SSE-based message streaming with pluggable parsers (plain text, JSON, XML, regex). Bring your own stream parser or use the built-ins. Supports partial JSON parsing for incomplete chunks.

### Multi-Modal Content
Text, images (PNG, JPEG, GIF, WebP, SVG), and documents (PDF, DOCX, TXT, CSV, JSON, Excel). Configure allowed file types, size limits, and previews through the attachments config.

### Voice Input & Output
Optional speech-to-text via the Web Speech API or Runtype's WebSocket voice service with barge-in interruption and voice activity detection. Text-to-speech playback for assistant responses. Enable via the voice config.

### Reasoning & Extended Thinking
Collapsible reasoning bubbles that display model chain-of-thought with duration tracking and streaming. Controlled by `features.showReasoning` — on by default, or override the renderer with a plugin hook.

### Tool Calls & Approvals
Expandable tool call bubbles showing name, status, arguments, and results. Optional human-in-the-loop approval system with configurable timeout. Controlled by `features.showToolCalls` with a plugin hook for custom rendering.

### Artifacts
Optional side-panel for rendering markdown and component content. Desktop split layout (resizable) or mobile drawer. Enable via `features.artifacts`, configure toolbar presets, copy behavior, and appearance.

### Event Stream Inspector
Optional real-time event capture with search/filter, badge coloring, timestamps, and expandable payloads. Enable via `features.showEventStreamToggle`. Customize rows, toolbar, and payload rendering through plugin hooks.

### Themes & Styling
Light and dark themes included. Full design token system (palette, semantic, component-level) with CSS variable support. Extend with built-in plugins for accessibility, reduced motion, high contrast, and branding — or create your own.

### Layout & Presets
Start from a built-in preset (shop, minimal, fullscreen) or configure from scratch. Header layouts, message layouts, avatars, timestamps, and slot-based rendering are all customizable. Dock as a floating widget or embed inline.

### Plugin System
14 render hooks covering the launcher, header, composer, messages, reasoning, tool calls, approvals, loading/idle indicators, and the event stream. Priority-based ordering with automatic fallback to defaults. Replace any piece of the UI without forking.

### Feedback & Analytics
Optional message-level upvote/downvote/copy with automatic backend submission. CSAT and NPS survey components. Wire up custom callbacks for your own analytics.

### Agent Execution
Renders multi-turn agent loops as they stream from the backend — displaying iteration progress, reflections, and stop reasons. Agent metadata is attached to every message. Customize how execution events appear through plugin hooks.

### Component System
Register custom components and render them inline via directives. Stream-aware parser and middleware for dynamic UI insertion during streaming.

### Message Injection
Programmatically insert messages (`injectMessage`, `injectAssistantMessage`, `injectUserMessage`, `injectSystemMessage`) with dual-content support — display one thing to the user while sending different content to the LLM.

## Proxy Deployment

Both proxy examples handle secure API key management, CORS, and multiple flow configurations.

- **vercel-edge** — best for quick deployment to Vercel or any Node.js host
- **cloudflare-workers** — best for global edge deployment with low latency

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
