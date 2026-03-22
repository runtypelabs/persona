---
"@runtypelabs/persona": patch
---

Fix message action buttons (copy, upvote, downvote) not responding to clicks

The event delegation handler in ui.ts used stale `tvw-` class name selectors that
didn't match the actual `persona-` prefixed classes on the rendered buttons. This
meant clicks were silently ignored after the class naming migration.

Also consolidates click handling: `createMessageActions` is now a pure rendering
function that emits buttons with `data-action` attributes. All behavior (clipboard,
vote state, callbacks, API submission) is handled exclusively via event delegation
in ui.ts, eliminating duplicated logic and divergent vote state that previously
existed between the two code paths.
