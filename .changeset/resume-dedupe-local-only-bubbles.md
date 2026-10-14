---
"@runtypelabs/persona": patch
---

Fix duplicated and polluted conversation history in client-token chats (runtypelabs/core#9961).

- `/v1/client/resume` and `/v1/client/approve` now send the id of the local bubble the resumed reply renders into as `assistantMessageId`, so the server stores the reply under the same id the widget later re-sends and deduplicates it by id instead of appending it again one turn later.
- Widget failure notices (a failed dispatch, a rejected approval decision, a reconnect that gave up) are marked `localOnly`: they render, but are never sent to the model as history or written to the storage adapter. Reconnect-failure bubbles stored by earlier versions are dropped the same way.
- A reload while a turn is parked on an await no longer spins the reconnect loop into a "Connection lost" bubble. A pending `ask_user_question` card or approval keeps its cursor for the answer's `/resume`; a WebMCP call interrupted by the reload gets one reconnect (so a replayed `await` re-dispatches it on the new page) and otherwise the turn ends quietly.
- The default localStorage transcript key now follows `persistState.keyPrefix` (`${keyPrefix}state`). The default prefix still uses `persona-state`, so existing unprefixed widgets keep their conversation; widgets with a custom prefix start a fresh, isolated transcript instead of sharing one.
