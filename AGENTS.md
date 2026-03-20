# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Persona is a pnpm monorepo containing a themeable, pluggable streaming chat widget for websites. It consists of two publishable packages and three example applications.

**Packages:**
- `packages/widget` (`@runtypelabs/persona`) - The main chat widget library
- `packages/proxy` (`@runtypelabs/persona-proxy`) - Optional Hono-based proxy server

**Examples:**
- `examples/embedded-app` - Vite demo with vanilla JS
- `examples/vercel-edge` - Node.js proxy for Vercel/Railway/Fly.io
- `examples/cloudflare-workers` - Edge proxy for Cloudflare Workers

## Common Commands

```bash
# Development
pnpm dev                # Start proxy (port 43111) + widget demo (port 5173) concurrently
pnpm dev:widget         # Start widget demo only
pnpm dev:vercel         # Start vercel-edge proxy only

# Build
pnpm build              # Build both widget and proxy packages
pnpm build:widget       # Build widget only
pnpm build:proxy        # Build proxy only

# Quality
pnpm lint               # Lint both packages
pnpm typecheck          # Type check both packages

# Testing (in packages/widget)
cd packages/widget
pnpm test               # Run tests in watch mode
pnpm test:run           # Run tests once
pnpm test:ui            # Run tests with UI

# Releases
pnpm changeset          # Create a changeset for version tracking
pnpm changeset version  # Apply changesets to bump versions
pnpm release            # Publish to npm
```

## Changesets Requirement

All changes that affect published packages must include a changeset. Create one with `pnpm changeset` before committing. Changesets go in `.changeset/` and describe what changed for the changelog.

## Architecture

### Widget Package (`packages/widget/src/`)

The widget uses a layered architecture:

1. **Entry Points**
   - `index.ts` - Public API exports
   - `install.ts` - Script tag installer for CDN usage
   - `runtime/init.ts` - Widget initialization

2. **Core Layer**
   - `client.ts` - HTTP client handling SSE streaming, message dispatch, and API communication
   - `session.ts` - Message state management, injection methods, client session handling
   - `types.ts` - All TypeScript type definitions (~1700 lines)

3. **UI Layer** (`ui.ts` + `components/`)
   - `ui.ts` - Main UI controller, DOM rendering, event handling
   - `components/` - Modular UI components (launcher, panel, header, messages, feedback)
   - `styles/widget.css` - Tailwind CSS with `tvw-` prefix for style scoping

4. **Utilities** (`utils/`)
   - `formatting.ts` - Stream parsers (JSON, XML, plain text)
   - `content.ts` - Multi-modal content handling (text, images, files)
   - `attachment-manager.ts` - File attachment handling
   - `actions.ts` - AI action parsing and handling
   - `component-parser.ts` / `component-middleware.ts` - Dynamic component system

5. **Extensibility**
   - `plugins/` - Plugin system for custom functionality
   - `postprocessors.ts` - Markdown and directive postprocessors
   - `defaults.ts` - Default configuration with theme presets

### Key Patterns

**Streaming:** SSE-based with pluggable parsers. Uses `partial-json` for incomplete JSON chunks during streaming.

**Content Priority Chain:** When building API payloads, content resolves as: `contentParts > llmContent > rawContent > content`

**Message Injection:** Use `injectMessage()`, `injectAssistantMessage()`, `injectUserMessage()`, `injectSystemMessage()` for programmatic message insertion. Supports dual-content where displayed content differs from LLM content.

**DOM Updates:** Uses `idiomorph` for efficient DOM morphing/diffing.

### Proxy Package (`packages/proxy/src/`)

Hono-based server that proxies requests to the Runtype API:
- `index.ts` - Main app factory and route handlers
- `flows/` - Pre-configured flow definitions (conversational, shopping, scheduling)

## Testing

Tests use Vitest. Main test files:
- `packages/widget/src/client.test.ts` - Client and streaming tests
- `packages/widget/src/session.test.ts` - Session and injection tests
- `packages/widget/src/utils/*.test.ts` - Utility tests

## Build Outputs

The widget builds to multiple formats via tsup:
- ESM (`dist/index.js`)
- CJS (`dist/index.cjs`)
- IIFE (`dist/index.global.js`) - For script tag usage
- TypeScript declarations (`dist/index.d.ts`)
