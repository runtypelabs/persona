---
"@runtypelabs/persona": minor
---

Add first-class message injection API with dual-content support

- Add `llmContent` field to `AgentWidgetMessage` for separating user-facing and LLM-facing content
- Add `injectMessage()`, `injectAssistantMessage()`, `injectUserMessage()`, and `injectSystemMessage()` methods
- Update content priority chain: `contentParts > llmContent > rawContent > content`
- Deprecate `injectTestMessage()` in favor of new injection methods
- Add comprehensive documentation at `docs/MESSAGE-INJECTION.md`

**New Feature: Dual-Content Messages**

Inject messages where the displayed content differs from what the LLM receives:

```javascript
// User sees rich markdown
// LLM receives concise summary
widgetHandle.injectAssistantMessage({
  content: '**Found 3 products:**\n- iPhone 15 Pro - $1,199...',
  llmContent: '[Search results: 3 iPhones, $799-$1199]'
});
```

This enables:
- Token efficiency (send summaries to LLM instead of full content)
- Sensitive data redaction (show PII to user, hide from LLM)
- Context injection (rich LLM context with minimal UI footprint)
