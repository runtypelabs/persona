---
"@runtypelabs/persona": minor
---

Add `features.history.showDelete` and `features.history.showDeleteAll` (both default true) to hide the visitor-facing delete controls in the conversation history view: `showDelete` removes each row's overflow menu (delete is its only item) and `showDeleteAll` removes the "Delete all conversations" footer control. Both hide the controls only; storage, retention, and the identity reset control are unchanged, and custom row slots still receive `requestDelete`.
