---
"@runtypelabs/persona": patch
---

Fix race condition in action handler resubmit feature

- Add `continueConversation()` method to session for triggering model continuation without adding a visible user message
- Add `triggerResubmit()` function to action context, allowing handlers to trigger resubmit AFTER async work completes
- Update resubmit handler to use `continueConversation()` instead of `sendMessage("[continue]")`
- This fixes the race condition where resubmit would fire before async data was injected, causing the model to hallucinate results
- The `[continue]` message is no longer visible to users
