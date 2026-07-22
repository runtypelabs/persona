---
"@runtypelabs/persona": patch
---

Inline mention completion now inserts a separating space after the token (matching Slack, Notion, and similar composers), so typing continues naturally and a fresh `@` chains another mention without a manual spacebar press. When the following character is already whitespace, no extra space is added and the caret hops the existing separator.
