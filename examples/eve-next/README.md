# Atlas workspace · Persona + Eve

A document workspace with a **Persona V5 copilot** beside the work. Browse three related project documents, ask for a summary or a risk review, follow the tool activity, and export the current document as Markdown. On smaller screens, switch between the document and copilot without losing the conversation.

The example uses the real `@runtypelabs/persona` widget with `future: { v5Defaults: true }`, embedded presentation, restrained tool rows, built-in follow-up suggestions, and the V5 scrolling defaults. Host styling belongs to the workspace; chat rendering belongs to Persona.

## Run Preview

From the repository root, with Node 24 and pnpm:

```sh
pnpm install
pnpm --filter eve-next dev
```

Open [localhost:3100](http://localhost:3100). **Preview is the default**: it needs no model key, account, or running Eve service. The visible mode label and footer identify it as prepared responses. Supported preview prompts summarize the selected document, identify launch risks, or propose next steps; other prompts explain the preview's limits.

Preview produces deterministic Eve-shaped events through the **same adapter and SSE boundary** as live requests. It reads the shared sample documents and milestones, streams text in chunks, and emits tool requests followed by their actual fixture results. It does not impersonate a live model, edit documents, or create tasks.

## Connect Live Eve

```sh
cp examples/eve-next/.env.example examples/eve-next/.env.local
```

Set these server-side values in `.env.local`:

```dotenv
EVE_MODE=live
AI_GATEWAY_API_KEY=your_gateway_key
```

Restart `pnpm --filter eve-next dev`, then select **Live Eve** in the copilot. With this explicit opt-in, `next.config.mjs` wraps the app in `withEve()`; Eve starts the `agent/` directory alongside Next.js and proxies its API through the same origin. The bundled agent reads sample documents and milestones and can offer follow-up replies. All model calls are made by Eve on the server.

To use an existing Eve deployment instead, set `EVE_MODE=live`, `EVE_BASE_URL`, and, when required by that deployment, `EVE_BEARER_TOKEN`. The Next.js app then skips its bundled Eve runtime. The bearer credential stays on the server; redirect following is disabled for credential-bearing requests. Do not use `NEXT_PUBLIC_` for either credential.

Preview remains available when Live Eve is configured. Selecting a different document or mode starts a fresh copilot conversation; the reset button clears the current conversation. Document export works in both modes.

## Integration and versions

Verified against the published **`eve@0.80.1`** package, **AI SDK `7.0.143`** (Eve's compatible peer), **Next.js `16.4.2`**, and **React `19.3.1`**. Eve is in beta; the SDK and event contract can change across versions.

The live adapter uses the current, typed API:

```ts
const client = new Client({ host, redirect: "error" });
const { response } = await client.sessions.create({ message: prompt, signal });
for await (const event of response) {
  // Translate Eve events into Persona's SSE protocol.
}
```

Each dispatch creates an independent Eve session with the current document context and Persona transcript. This deliberately avoids a shared in-memory session map, cross-user session reuse, or replaying the transcript into an already populated Eve session. It is a simple example, not a durable conversation-resumption implementation.

| Eve event | Persona output |
| --- | --- |
| `message.appended` / `messageDelta` | streamed text |
| `reasoning.appended` / `reasoning.completed` | separate reasoning activity, without duplicating completed snapshots |
| `actions.requested` / `tool-call` | `tool_start`, preserving the call ID and input |
| `action.result` / `tool-result` | `tool_complete`, with the real output and success status |
| `turn.failed`, `session.failed`, cancellation | terminal error, never a fabricated successful turn |
| `input.requested` | clear unsupported-approval error; this example has no resume endpoint |

Pending tools do not become successful merely because the stream ends. SDK failures are presented as a generic connection error, without internal provider details. Request cancellation asks Eve to cancel its current turn. Only explicit provider `reasoning.appended` / `reasoning.completed` events become reasoning rows; assistant prose is never reclassified as reasoning. Preview includes a short, labeled reasoning fixture to demonstrate that UI.

Key files:

- `app/components/workspace.tsx`: responsive workspace, document selection, mode, reset, export.
- `app/components/persona-widget.tsx`: real Persona V5 configuration and lifecycle.
- `app/lib/eve-adapter.ts`: typed live SDK connection and event mapping.
- `app/lib/preview-session.ts`: deterministic offline Eve event fixture.
- `app/lib/workspace.ts`: shared sample documents and milestone data.
- `agent/tools/`: read-only document and milestone tools plus follow-up suggestions.
- `app/lib/persona-wire.ts`: vendored zero-dependency Persona wire helper; maintained from the repository's canonical helper.

The implementation was checked against Eve's [Client SDK documentation](https://github.com/vercel/eve/blob/main/docs/guides/client/overview.mdx), [Next.js integration](https://github.com/vercel/eve/blob/main/docs/guides/frontend/nextjs.mdx), and [channel authentication](https://github.com/vercel/eve/blob/main/docs/channels/eve.mdx), plus the declarations shipped in the pinned npm package.

## Production

A normal build opens in Preview and does not require credentials or start Eve:

```sh
pnpm --filter eve-next build
pnpm --filter eve-next start
```

For a live deployment, configure `EVE_MODE=live` at build and runtime and follow Eve's Next.js deployment guide. The bundled channel uses `vercelOidc()` and `localDev()` instead of anonymous production access. The default is suitable for local development; production requires configuring verified credentials between the Next route and Eve, or replacing the channel policy with the application's authentication system. Protect the dispatch route with application authentication and rate limits before offering paid model access publicly. A server-side model key alone does not authorize app users.

## Validate

```sh
pnpm --filter eve-next test
pnpm --filter eve-next lint
```

Offline tests cover streaming text, tool lifecycle ordering, failed and missing results, follow-up payloads, the current SDK session API, credential handling, error redaction, disconnected response consumers, all three preview documents, and invalid/live-disabled route requests. They do not claim to validate a paid model response or a deployed Eve runtime.
