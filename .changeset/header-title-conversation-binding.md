---
"@runtypelabs/persona": minor
---

Add `layout.header.titleSource: "conversation"` to bind the header title (or `titleMenu` label) to the active conversation's title, the Claude-style pairing for a title menu holding conversation actions; it falls back to `launcher.title` while no titled conversation is open and updates when a server-generated title arrives through a history list refresh. The `history:conversationOpened` event now carries the conversation `title` (null when not yet known), and the history view accepts an `onActiveConversationTitle` callback reporting title changes for the active conversation.
