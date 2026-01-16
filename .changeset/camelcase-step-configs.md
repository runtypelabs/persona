---
"@runtypelabs/persona": patch
"@runtypelabs/persona-proxy": patch
---

Complete camelCase migration for step config fields and add ESLint enforcement

Proxy step config changes:
- `response_format` → `responseFormat`
- `output_variable` → `outputVariable`
- `user_prompt` → `userPrompt`
- `system_prompt` → `systemPrompt`
- `previous_messages` → `previousMessages`

ESLint rule added to prevent snake_case regression in API payloads.
