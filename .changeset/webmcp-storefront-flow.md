---
"@runtypelabs/persona-proxy": minor
---

Two proxy additions:

- **`WEBMCP_STOREFRONT_FLOW`** — an in-code agent definition for the WebMCP "Switchback" storefront demo. The demo now runs through the local proxy like the other examples (via a new `/api/chat/dispatch-webmcp` route) instead of requiring a client token pointed at a hosted Runtype agent — the page's `clientTools[]` are forwarded upstream and the `/resume` round-trip is proxied, with the full agent prompt and model living in the repo.
- **Preview-aware CORS** — `createChatProxyApp` now reflects dynamic preview origins so per-branch preview deployments work without enumerating their URLs. It reflects the caller's origin when the proxy itself is a preview runtime (`VERCEL_ENV === "preview"`) and when the origin matches the new `previewOriginPattern` option (default `https://*.vercel.app`; settable via the `PREVIEW_ORIGIN_PATTERN` env var to allow other preview domains, or `false` to disable). The exact `allowedOrigins` allowlist and production behavior are unchanged.
