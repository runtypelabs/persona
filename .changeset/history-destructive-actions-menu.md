---
"@runtypelabs/persona": minor
---

Move the Messages view's destructive actions into an overflow menu. "Delete all conversations" and "Forget this device" no longer sit as standing buttons under the conversation list: a quiet ellipsis trigger now sits at the right end of the "Messages on this device" caption row and opens a menu holding whichever of the two applies. Delete-all appears only when there are conversations to delete, forget-this-device only when the history provider supports it, and the trigger itself drops out when neither has anything to offer. The trigger renders through the first load so the row does not shift as the list arrives.

The menu reuses the per-row overflow behaviour: Escape closes it, arrow keys move between items, and clicking outside dismisses it. The trigger's accessible name comes from a new `features.history.copy.listOptionsLabel` key, default "Conversation options". `features.history.showDeleteAll` still gates the delete-all affordance, now as a menu item.

Themes that targeted `.persona-history-footer`, `.persona-history-destructive`, `.persona-history-clear` or `.persona-history-reset` should move to `.persona-history-caption`, `.persona-history-list-options` and `.persona-history-menu-item`.
