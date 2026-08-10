---
"@runtypelabs/persona": minor
---

Add per-visitor conversation history for client-token mode, default off. `features.history.enabled` turns on a Messages surface listing the visitor's past conversations with server titles and previews, transactional conversation switching and resume across page loads, a durable visitor credential with cross-tab convergence and reset, verified cross-device scope via `getIdentityProof` with evidence-based scope reporting, display-projection finalization so reopened transcripts show what the visitor saw, and public controller methods and events (`openConversation`, `startNewConversation`, `clearConversationHistory`, `resetHistoryIdentity`, `history:*`). The Messages view ships as a lazily loaded sibling chunk; proxy and agent modes are unaffected. In panel presentation the view's top bar is the widget's single header (the shell header is hidden and inert until Messages closes), and the scope status reads as one quiet subtitle line with its explanation attached to screen readers rather than as a second band.

`history:conversationStarted` (`{ conversationId, timestamp }`) fires whenever a replacement conversation is committed, from the header action, the in-panel "New conversation" control, or `startNewConversation()`. It lets a host composition distinguish that commit from a plain `history:closed`.
