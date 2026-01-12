---
"@runtypelabs/persona": patch
---

Fix race condition with resubmit flag for async action handlers

When an action handler returns `resubmit: true`, the library now waits for `injectAssistantMessage()` to be called before triggering the automatic model continuation. This prevents race conditions where the resubmit would fire before async operations (like API calls) completed, causing the model to hallucinate instead of using the injected data.

Previously, the `action:resubmit` event was emitted immediately when the handler returned, which fired too early for handlers with async operations. Now, the resubmit is deferred until after the handler injects its results via `injectAssistantMessage()`.

Handlers that use `context.triggerResubmit()` are unaffected and continue to work as before.
