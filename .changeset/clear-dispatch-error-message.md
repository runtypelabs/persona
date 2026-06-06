---
"@runtypelabs/persona": minor
---

Improve the dispatch-failure fallback message and make it configurable. Replaces the misleading "proxy isn't returning a real response yet" copy with an honest message that explains the chat service couldn't be reached and surfaces the underlying error reason. Adds a new `errorMessage` config option (a static string or `(error) => string`) to override the copy; returning an empty string suppresses the fallback bubble while still firing `onError`.

Also fixes abort handling on `continueConversation`: a cancelled continuation (e.g. a superseded in-flight stream) no longer shows the dispatch-error bubble or fires `onError`, matching `sendMessage`'s behavior — only genuine failures surface.
