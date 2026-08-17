---
"@runtypelabs/persona": minor
---

Open conversations optimistically from the Messages list. Selecting a row now navigates immediately: the panel exits, the header shows the conversation's title seeded from the list row, skeleton bubbles stand in for the transcript, and the composer is gated until the fetch resolves and hydrates the messages. A failed fetch shows a retryable error surface with a way back to Messages instead of silently staying on the list. The `history:conversationOpened` event still fires on the committed hydration, so it now follows `history:closed`. New overridable copy keys: `openConversationLoadingLabel`, `openConversationErrorTitle`, `openConversationRetryLabel`, `openConversationBackLabel`. `controller.openConversation` keeps its transactional contract, resolving after hydration and rejecting on failure.
