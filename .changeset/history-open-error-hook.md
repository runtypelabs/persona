---
"@runtypelabs/persona": minor
---

Add a `renderHistoryOpenError` plugin hook for the surface shown when opening a conversation from the Messages list fails. Plugins run by priority, the first non-null element wins, and null falls through to the default block. The context carries the conversation id, resolved copy, a `retry()` that re-runs the open through the token-guarded flow, and a `back()` that returns to Messages (absent when history is unavailable); Persona keeps the centered transcript column, the alert role, and the composer gate around whatever the hook returns. The default block also moved from inline styles to stylesheet classes (`persona-conversation-loading-error`, `-body`, `-title`, `-actions`, `-action`), so CSS-only restyling works.
