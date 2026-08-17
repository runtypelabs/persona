---
"@runtypelabs/persona": minor
---

Add visitor-scoped conversation rename and star. The history provider seam gains an optional `update(id, { title?, starred? })` capability (summaries gain `starred`); the controller exposes `renameConversation()`, `setConversationStarred()`, and `getActiveConversationId()`. Starred conversations pin into a leading "Starred" group (new `groupStarred` copy override) with a star mark on the row. `titleMenu.onSelect` may return `false` to fall through to widget built-ins, the same contract as the artifact copy menu: `star` toggles the active conversation's star and `delete` runs the shell's confirm-then-delete; `rename` stays host-owned. Renames update the `titleSource: "conversation"` header binding and the open list in place, and a user-set title pins against later auto-generated titles.

`layout.header.titleSource: "conversation"` binds the header title (or `titleMenu` label) to the active conversation's title. It falls back to `launcher.title` while no titled conversation is open and updates when a server-generated title arrives through a history list refresh. `history:conversationOpened` now includes `title` (null when not yet known). The history view accepts an `onActiveConversationTitle` callback for title changes on the active conversation.

When `titleSource` is `"conversation"` and no conversation is open, a conversation-bound `titleMenu` locks into a plain title (no chevron, no menu) instead of offering actions with nothing to act on; it unlocks as soon as a conversation is active.
