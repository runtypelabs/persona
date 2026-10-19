# Threat model

## What this project does and where untrusted input enters
Persona is a streaming chat UI for AI agents, shipped as two npm packages:

- **`@runtypelabs/persona`** (`packages/widget`): a browser widget embedded on third-party sites
  (script tag via `install.ts`, or ESM/CJS). It renders streamed model output, runs tools in the
  page (WebMCP and built-in client tools), and keeps session state in browser storage.
- **`@runtypelabs/persona-proxy`** (`packages/proxy`): a Hono server (`createChatProxyApp()`) that
  sits between the widget and the Runtype API, holding the API key and pinning flows/agents server-side.

Untrusted input:
- **Model / agent output streamed over SSE** (`client*.ts`, `utils/formatting.ts`, `utils/event-stream-*.ts`):
  text, markdown, tool calls, artifacts, component directives, actions. Treat it as attacker-controlled,
  because prompt injection can steer it.
- **Tool results and tool arguments**: WebMCP tool lists from `document.modelContext`, and tool calls
  the model asks the browser to execute.
- **Restored state**: persisted messages and history from browser storage and from the server
  (`session-history`, `session-reconnect`, `client-history*`).
- **User input**: composer text, attachments (`utils/attachment-manager.ts`), voice transcripts.
- **Proxy HTTP requests** from any internet client: request body (messages, `agent`, `clientTools`,
  metadata), `Origin` header, and the `/resume` and feedback routes.

Trusted: the integrating developer's widget config (`window.siteAgentConfig`, `initAgentWidget()` options,
including a custom `sanitize` function or `sanitize: false`, plugins, postprocessors), the proxy operator's
options (`allowedOrigins`, `agentConfig`, `flowId`, API key), and the upstream Runtype API itself.

## Components that matter most / least
Most important:
- **HTML sanitization of rendered content**: `utils/sanitize.ts` (DOMPurify config + hooks), `postprocessors.ts`,
  `markdown-parsers-loader.ts`, and every place that writes model-derived strings to the DOM
  (`ui.ts`, `components/`, `utils/dom.ts`, idiomorph morphing). Any path from model output to script
  execution or attribute injection with the default `sanitize: true` matters.
- **Component directives and actions**: `utils/component-parser.ts`, `utils/component-middleware.ts`,
  `utils/actions.ts`, form directives, artifacts (`artifacts-ui.ts`, `utils/artifact-custom-actions.ts`).
- **Tool execution in the page**: `webmcp-bridge.ts`, `webmcp-runtime.ts`, `approval-ui.ts`,
  `client-resume.ts`, `ask-user-question-tool.ts`, `suggest-replies-tool.ts`. A tool running without the
  configured approval, or a model-supplied name reaching a tool it should not, is in scope.
- **Proxy**: `packages/proxy/src/index.ts`: CORS (`withCors`, `allowedOrigins`, `previewOriginPattern`,
  `NODE_ENV`/`VERCEL_ENV` handling), rejection of client-supplied `agent`, server-pinned agent/flow
  enforcement, request guards, header and body forwarding to upstream, API key exposure.

Also in scope: `install.ts` / `launcher-global.ts` (script loading and URL derivation), storage
(`utils/storage.ts`, `utils/plugin-storage.ts`), voice providers (`voice/`), `smart-dom-reader.ts`.

Out of scope: `apps/`, `examples/`, `e2e/`, `scripts/`, `docs/`, test files, `packages/widget/src/vendor/`
(vendored third-party code, unless Persona uses it unsafely), and third-party dependencies.

## How to exercise it
- Built in the image (`pnpm build`), output in `packages/widget/dist` and `packages/proxy/dist`.
- Tests: `pnpm --filter @runtypelabs/persona test:run` and `pnpm --filter @runtypelabs/persona-proxy test:run`
  (Vitest; Node environment by default, DOM-heavy files opt into jsdom; no network). `sanitize.test.ts`, `postprocessors.test.ts`,
  `ui.postprocess.test.ts`, `webmcp-bridge.test.ts` and `packages/proxy/src/index.test.ts` are good
  starting points for regression tests.
- The proxy can be driven in-process with `createChatProxyApp({...}).request(...)` (Hono), with `fetch` stubbed.

## How you rate severity
- **Critical**: script execution in the host page from model output, tool output or restored history with
  the default config; leaking the proxy's upstream API key; bypassing a server-pinned agent/flow so an
  anonymous client controls the upstream agent definition or tools.
- **High**: a WebMCP/client tool executing without the approval the integrator configured; CORS reflecting
  an arbitrary origin when `allowedOrigins` is set and `NODE_ENV` is not `"development"`; navigation to
  `javascript:`/`data:` URLs from model-rendered links or actions; reading or overwriting another
  widget's/session's stored state.
- **Medium**: HTML/CSS injection without script execution (UI redress, phishing content inside the widget);
  open redirects; DoS from a single crafted stream or request (unbounded memory, catastrophic regex).
- **Low**: issues that need a non-default, insecure configuration, or a malicious integrator or proxy operator;
  DoS that needs large traffic.

## Anything to leave alone
- `sanitize: false` or a custom `sanitize` function disables the default protection by design; do not report
  XSS that only exists with those settings.
- `createChatProxyApp()` without `allowedOrigins` is permissive by design (documented); `NODE_ENV=development`
  and Vercel preview deployments reflecting origins is intentional.
- The model choosing to call a tool the page exposed is expected; report only bypasses of approval or scoping.
- Do not report outdated dependencies without a reachable exploit path in Persona.
- Patches: minimal TypeScript, with a Vitest regression test next to the affected code. Changes to
  `packages/*` need a `.changeset/` entry (see `AGENTS.md`).
