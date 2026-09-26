---
"@runtypelabs/persona": minor
---

Client token mode: call `/v1/client/init` when the visitor shows intent to send, instead of on mount. The new `sessionInit` option picks the moment: `'input'` (default, first keystroke), `'focus'` (user focus of the composer, never programmatic autofocus), `'mount'` (the previous behavior), `'send'` (no early init), or a function for a custom trigger such as hover. `controller.warmSession()` triggers it imperatively. The early init is fire-and-forget: it runs at most once per session lifetime, errors are swallowed and resurface when the send retries, and a send reuses an in-flight init, so the requests are the same as before, only earlier. Widgets with `features.history.enabled` still init on mount. Feedback on a restored transcript now initializes the session on demand. If your client token has a server-configured welcome message you want shown before the visitor types, set `sessionInit: 'mount'`.
