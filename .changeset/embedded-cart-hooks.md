---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": patch
---

Add embedded cart pattern support with new state hooks

**New Features:**

- `onStateLoaded` hook: Transform or inject messages after state loads from storage but before widget initializes. Useful for navigation-based message injection, checkout returns, or external state sync.

- `user:message` event: Emitted when a new user message is detected. Includes `viaVoice: true` if sent via voice recognition.

- Enhanced state persistence: Automatically restore widget open state, voice recognition state, and input focus across page navigations when using `persistState`.

**Bug Fixes:**

- Don't show fallback error messages when requests are intentionally aborted (e.g., user navigates away or cancels)

**Proxy:**

- Added `bakery-assistant` flow for the bakery demo example

**Documentation:**

- Added comprehensive Controller Events documentation with all available events and payload types
- Added examples for `onStateLoaded` hook usage
