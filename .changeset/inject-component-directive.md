---
"@runtypelabs/persona": minor
---

Make injecting component directives a first-class API.

- `InjectMessageOptions` now accepts an optional `rawContent` field, and `injectMessage` / `injectAssistantMessage` / `injectUserMessage` / `injectSystemMessage` / `injectMessageBatch` forward it onto the resulting message. This unblocks rendering streamed-style directives (e.g. `{ "text": "...", "component": "Foo", "props": {...} }`) without falling back to the deprecated `injectTestMessage` event envelope.
- New `injectComponentDirective({ component, props, text?, llmContent?, id?, createdAt?, sequence? })` convenience method on the session and controller. Builds the canonical directive JSON, sets `content` to `text`, `rawContent` to the directive, and forwards `llmContent` so the LLM can see a redacted version on subsequent turns.
- `hasComponentDirective` and `extractComponentDirectiveFromMessage` now fall back to `content` when `rawContent` is missing and `content` looks like JSON, so messages injected via `content` alone still render as components. `rawContent` is still preferred when both are present.
