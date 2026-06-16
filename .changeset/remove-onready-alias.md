---
"@runtypelabs/persona": major
---

Remove the deprecated `onReady` callback and the `persona:ready` DOM event. Both were aliases of `onChatReady` / `persona:chat-ready` and have logged a deprecation warning since they were renamed. Migrate any `onReady` install/init option to `onChatReady`, and any `persona:ready` event listener to `persona:chat-ready`.
