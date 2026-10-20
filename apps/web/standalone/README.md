# Standalone examples

Four examples cover the distinct installation and integration paths:

| Page | Purpose |
| --- | --- |
| `sample.html` | Minimal installer config and a copyable, self-contained embed snippet; starts a fresh chat each visit. |
| `example-shop.html` | Shopping context, JSON actions, a demo cart, checkout requests, persisted chat/navigation, and voice input. |
| `preview-mode.html` | Gate installation with a URL parameter. |
| `lifecycle-events.html` | Observe deferred launcher loading and lifecycle callbacks. |

Build the widget with `pnpm build:widget`, then run `pnpm dev:widget`. The minimal and shopping pages use `/widget-dist` on localhost, IPv4 loopback, or IPv6 loopback; published assets use the `@4` major range. Run `pnpm dev` for the local showcase proxy too. The copied minimal snippet uses `/api/chat/dispatch`: replace that with your own Persona-compatible backend endpoint.

## Shopping integration

The canonical shopping page loads via `install.global.js`. Its configuration is inline so it can be copied to another storefront without importing showcase modules; the final module script only supplies this site's navigation.

- A context provider gathers fresh enriched page context. Request middleware merges it into metadata for the metadata shopping route without changing the user's message or replacing `window.fetch`.
- The SDK JSON stream parser and action manager handle completed messages and action deduplication. Custom handlers cover messages, element clicks, checkout, and same-origin navigation.
- Checkout posts items to `/api/checkout` on the configured backend and follows its returned URL. The backend must validate products and prices and configure its payment service. The local cart only demonstrates button interactions; this is not a Shopify API integration.
- The storage adapter retains chat state, draft and metadata, including action IDs and SDK voice state. Navigation records are also written synchronously to session storage, expire after 30 seconds, and reopen chat with the arrival message once. Install the integration on destination pages to continue the chat there.
- Voice input is enabled with `autoResume: 'assistant'`; microphone activation remains user initiated and uses the SDK's existing policy.

Local requests use the Vite proxy. Hosted pages use `https://proxy.persona-chat.dev`; configure `apiBase` for your own backend. Chat and checkout require that backend; no successful backend or payment connection is implied by a rendered launcher.

The new consolidated demo uses `persona-standalone-shopping` for chat state and navigation keys. Old demo storage is left untouched rather than importing the ambiguous `vanilla-agent-action-middleware` key shared with other examples.

## Retired URLs

`shopify.html`, `example-shop-metadata.html`, `example-shop-installer.html`, and `example-shop-installer-voice-metadata.html` are small redirect pages targeting `example-shop.html`. They preserve query strings and fragments with `location.replace` and provide an ordinary link when JavaScript is disabled. Keep these HTML inputs in the Vite build so published bookmarks continue to work.

The former `sample.html` shopping/navigation implementation is covered by the canonical shop. The original direct-init, prompt-appending, and metadata variants are represented by one installer + metadata implementation rather than separate implementations of the same behavior. Direct initialization remains documented in the package's installation guide.
