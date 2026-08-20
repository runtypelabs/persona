---
"@runtypelabs/persona": patch
---

Programmatic `openConversation()` and `startNewConversation()` no longer focus the composer, so a boot-time reopen (the recommended persist-and-reopen pattern) cannot scroll the host page to the widget; for a widget in a same-origin iframe the whole parent page scrolled to it on load. Interaction paths keep the messenger behavior: selecting a conversation row, retrying a failed open, and the header new-conversation and clear-chat actions still move focus to the composer. Pass `{ focus: true }` to either controller method to opt a programmatic call into focusing.
