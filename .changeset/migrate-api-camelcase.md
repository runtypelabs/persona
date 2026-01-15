---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": minor
---

Migrate to camelCase API convention

Update all API interactions to use camelCase field names to match the Runtype API's native camelCase convention.

**Breaking Change**: Requires Runtype API v2.x+ with camelCase support.

Proxy changes:
- `stream_response` → `streamResponse`
- `record_mode` → `recordMode`
- `flow_mode` → `flowMode`
- `auto_append_metadata` → `autoAppendMetadata`

Widget client changes:
- Init: `flow_id` → `flowId`, `session_id` → `sessionId`
- Response: `session_id` → `sessionId`, `expires_at` → `expiresAt`, `welcome_message` → `welcomeMessage`
- Chat: `session_id` → `sessionId`, `assistant_message_id` → `assistantMessageId`
- Feedback: `session_id` → `sessionId`, `message_id` → `messageId`
