# Durable session reconnect

A **durable agent run** keeps executing **server side** even when the browser
disconnects: the backend persists each streamed SSE frame with an `id: <seq>`
cursor line, and exposes a read-only endpoint that replays everything after a
cursor and then live-tails. This is the shape of any long-running, resumable
agent execution: Claude Managed agents are one example, but so is any
async/background agent run whose turns the backend keeps and can re-stream. The
mechanism here is backend-agnostic; all it requires is the SSE cursor and a
replay-from-cursor endpoint.

This guide covers the **client side**. By default Persona finalizes the assistant
message the instant the SSE connection drops (tab reload, laptop sleep, a network
blip, an upstream stream timeout), so the user sees a truncated answer even though
the server has more. With durable reconnect wired up, the widget instead reads the
cursor off the wire, recognizes a real drop (as opposed to a graceful finish or an
intentional pause), and reconnects to replay the missed frames and keep filling
the same bubble.

The feature **self-gates** on the wire, not on a specific backend. It only arms
when the stream actually carries SSE `id:` lines and an `executionId`, which only
a durable, resumable execution emits (with Runtype's Claude Managed lane, that is
a saved agent dispatched with a `conversationId`). Streams with no `id:` lines
(plain flow dispatch, the non-durable inline lane, or any backend that does not
stamp a cursor) never form a resume handle and finalize on drop exactly as before.
Shipping the config is safe even on pages that never hit a durable lane.

---

## The three coordinates

Reconnecting needs three pieces of addressing:

| Coordinate | Identifies | Where it comes from |
| --- | --- | --- |
| `(agentId, conversationId)` | the backend session that owns this turn | host-known (you already have both) |
| `executionId` | which turn to rejoin | comes off the stream (`agentMetadata.executionId`) |
| `after=<lastEventId>` | the replay cursor | the highest SSE `id:` seq the widget has applied |

The widget tracks `executionId` and `lastEventId` for you. `agentId` /
`conversationId` are **host owned** on the legacy reconnect API: they live in
the closure you give to `reconnectStream` (and to `customFetch`). The optional
conversation history API also exposes the active conversation ID. Background
switching below passes that ID explicitly to its own adapter.

Those coordinates address a replay-from-cursor endpoint. The Runtype API provides
one; a self-hosted async-agent backend exposes an equivalent of the same shape:

```
GET /v1/agents/{agentId}/executions/{executionId}/events?conversationId=<cid>&after=<seq>
```

It replays the durable log where `seq > after`, then live-tails if the turn is
still running, else closes after the replay. The response is `text/event-stream`
with the **same** wire vocabulary as the live stream, so the widget consumes it
with the same parser. Any backend that can replay an execution's frames after a
cursor and keep tailing works the same way.

---

## Step 1: in-session reconnect (network blip, sleep, timeout)

For drops where the page is still alive, you only need one config hook:
`reconnectStream`. It is the host-owned reconnect transport, symmetric to
`customFetch`. When a durable stream drops mid-turn, the widget calls it, pipes
the returned `text/event-stream` `Response` through its normal event pipeline, and
resumes.

```ts
createAgentExperience(el, {
  apiUrl: "/api/chat/dispatch",
  // ...your customFetch / getHeaders / theme / launcher

  reconnectStream: ({ executionId, after, signal }) =>
    fetch(
      `${baseUrl}/v1/agents/${agentId}/executions/${executionId}` +
        `/events?conversationId=${conversationId}&after=${after}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Persona-Version": personaVersion,
        },
        signal,
      },
    ),
});
```

Resolve with the events `Response`. Throw, or resolve with a non-ok response, to
signal that this attempt failed: the widget then backs off and retries, and gives
up after the bounded attempts.

That is all you need for the in-session case. The widget:

- enters the `resuming` state and keeps the in-progress bubble open (it is not
  finalized),
- retries with exponential backoff (default `[1000, 2000, 4000, 8000, 8000]` ms,
  about 5 attempts over about 30 seconds),
- also attempts immediately on tab refocus (`visibilitychange`) and on the browser
  coming back `online`,
- seeds the resumed bubble with the text already shown, so the replayed
  post-cursor deltas append rather than overwrite,
- on the graceful terminal, finalizes the message and returns to `idle`.

Tune the backoff if you want:

```ts
reconnect: { maxAttempts: 8, backoffMs: [500, 1000, 2000, 4000] },
```

If `reconnectStream` is not configured, a durable drop finalizes the message just
like today: in-session reconnect is purely additive.

---

## Step 2: survive a tab reload (the persistence handshake)

An in-session drop reuses the live session object. A full tab reload throws it
away, so to resume after a reload the resume handle has to be **persisted** and
replayed on boot. Two seams cover this, and both keep the host as the single owner
of all three coordinates (the `conversationId` is already yours):

```ts
createAgentExperience(el, {
  // ...reconnectStream as above

  // Called whenever the resume handle changes: created when a durable turn
  // starts streaming, advanced as the cursor climbs (throttled), and null when
  // the turn finishes, errors, or is torn down. Persist it next to your
  // conversationId.
  onExecutionState: (handle) => {
    if (handle) {
      saveResume(conversationId, {
        executionId: handle.executionId,
        after: handle.lastEventId,
      });
    } else {
      clearResume(conversationId);
    }
  },

  // On the next mount, if you read back a non-terminal handle, pass it here.
  // The widget enters `resuming` immediately and replays from `after` into the
  // restored conversation.
  resume: savedResume?.executionId
    ? { executionId: savedResume.executionId, after: savedResume.after }
    : undefined,
});
```

The `handle` passed to `onExecutionState` is a `ResumableHandle`:

```ts
type ResumableHandle = {
  executionId: string;   // the durable turn
  lastEventId: string;   // the ?after= cursor
  assistantMessageId: string; // the open bubble (internal bookkeeping)
  status: "running";
};
```

Persist only `executionId` and `lastEventId` (alongside the `conversationId` you
already store). The `conversationId` is what ties the persisted handle back to the
right backend session, and your `reconnectStream` closure supplies it on
reconnect.

Order on boot: restore the conversation history first (your `initialMessages` or
`storageAdapter`), then pass `resume`. The widget reopens the trailing assistant
bubble and the replay (`seq > after`) appends to it.

---

## States, copy, and events

While reconnecting, the widget surfaces two statuses in addition to the usual
`idle` / `connecting` / `connected` / `error`:

- `paused`: a durable stream dropped and a reconnect is pending.
- `resuming`: a reconnect attempt is in flight.

The in-progress bubble and the typing indicator stay visible throughout. Override
the status copy:

```ts
statusIndicator: {
  pausedText: "Connection lost, hold on…",
  resumingText: "Reconnecting…",
},
```

Three controller events let you react (analytics, a custom banner, a toast):

```ts
widget.on("stream:paused",   (e) => { /* e.executionId, e.after */ });
widget.on("stream:resuming", (e) => { /* e.executionId, e.after, e.attempt */ });
widget.on("stream:resumed",  (e) => { /* e.executionId, e.after */ });
```

And `controller.reconnect()` triggers a manual retry (for a "Reconnect" button),
which also short-circuits the current backoff if one is already running.

---

## How it stays correct

- **No gaps, no dupes.** The cursor is the SSE `id:` line (the durable row seq).
  The widget advances it only on frames it has fully applied, and the server
  replays strictly `seq > after`, so the replay never overlaps what you already
  saw. The reconnect seeds the bubble with the already-shown text, so post-cursor
  deltas append cleanly.
- **Drop vs. finish vs. pause.** A graceful end (`execution_complete`) finalizes
  and clears the handle. An intentional pause (an `ask_user_question` or approval
  `await`) is left parked, not reconnected. Only a stream that ends with neither,
  while a resumable handle is live and the user did not cancel, is treated as a
  drop.
- **No duplicate execution.** The reconnect endpoint is a read-only attach: the
  live turn keeps its single owner, so two tabs watching the same run fan out from
  one backend session without double-running tools. (This depends on the backend's
  attach being read-only; it holds for Runtype's session-owner model.)

---

## Caveats

- **Durable lane only.** Reconnect arms only on streams that carry `id:` lines and
  an `executionId`, i.e. a backend running a resumable, server-persisted execution
  and stamping the cursor. For Runtype's Claude Managed lane that means a saved
  agent dispatched with a stable `conversationId`; a different backend (an
  async/background agent runner of your own) just needs to emit the same cursor and
  expose a replay-from-cursor endpoint.
- **Legacy reconnect coordinates remain host owned.** Keep the conversation ID
  in your `reconnectStream` / `customFetch` closure and persist it next to the
  handle. These closures alone do not enable background conversation switching.
- **The cursor is per durable row.** A single row that expands into several frames
  (some media or artifact rows) could in principle split on a TCP boundary; the
  widget advances the cursor only on fully-parsed frames to bound this. Plain text
  deltas, the common case, are one frame per row.


## Opt-in background conversation switching

With an authorized `features.history.provider`, a durable backend can allow the
user to open B while A continues on the server:

```ts
const controller = createAgentExperience(el, {
  apiUrl: "/api/chat/dispatch",
  features: { history: { enabled: true, provider: historyProvider } },
  backgroundConversations: {
    capabilities: { durableExecution: true, readOnlyReplay: true },
    reconnectStream: ({ conversationId, executionId, after, signal }) =>
      fetch(`/api/conversations/${encodeURIComponent(conversationId)}` +
        `/executions/${encodeURIComponent(executionId)}/events?after=${encodeURIComponent(after)}`,
        { signal }),
    // Optional. This endpoint/subscription reports actual server state.
    subscribeStatus: ({ conversationId, executionId }, callback) =>
      subscribeToExecution(conversationId, executionId, callback),
  },
  onConversationExecutionState: (state) => updateConversationBadge(state),
});

await controller.openConversation("conversation-b", { busy: "background" });
// Returning restores A's matching partial transcript and catches up read-only.
await controller.openConversation("conversation-a");

controller.on("conversation:executionState", (state) => {
  // conversationId, executionId, status, detached (plus normal instance metadata)
});
```

`busy` still defaults to `"reject"`. `"stop"` retains the existing local Stop
behavior. `"background"` requires the explicit adapter above; a legacy
`reconnectStream` closure, SSE IDs, or a client token alone never opts a backend
in. Ordinary client-token installations keep their current behavior.

The two capability declarations are backend promises, not automatic detection:

- Closing or aborting the browser response must leave the server execution
  running. Dispatch must persist its execution identity and ordered event log.
- Reconnect must authorize the exact conversation/execution pair, replay strictly
  after the applied cursor, and then tail the same execution. It must never start
  another execution, run a tool, or submit an approval.
- Conversation activation is prepared and committed through the history provider.
  A failed preparation, rejected commit, or superseded selection preserves the
  original stream. The provider must honor its existing transactional contract:
  a rejected commit leaves the active binding unchanged.

Persona stores an in-memory checkpoint containing A's partial transcript, applied
cursor, active text block and native parser state, tool/reasoning messages, and
artifact state. It closes the local transport only after B's activation succeeds.
On return, history authorization runs again, then Persona restores the saved
checkpoint and replays events after its cursor. A newer fetched history page may
already contain A's finished answer; it is never used as the append base for that
older cursor. This prevents duplicated text and tools. Failed authorization keeps
the checkpoint available for a later retry.

The native event parser preserves text block boundaries, accumulated raw text for
structured `streamParser` factories, nested block attribution, media buffers, and
artifact accumulation. A custom `parseSSEEvent` closure has its own hidden parser
state and currently rejects background switching. The backend must retain replay
for the execution being attached and must reject deleted or unauthorized pairs.
A history provider must report identity changes through its subscription and must
be replaced when its authorization context is replaced.

A turn still preparing locally, one without a durable cursor/execution/active
conversation, or one already awaiting browser tools or approval rejects unsafe
detachment. Native replay displays newly encountered browser-tool waits and
approvals and reports `needs-attention`; it does not automatically execute browser
tools from the replay. User decisions use the existing explicit resolution paths.

`ConversationExecutionState` contains:

```ts
{
  conversationId: string;
  executionId: string;
  status: "running" | "needs-attention" | "completed" | "failed";
  detached: boolean;
}
```

Without `subscribeStatus`, a detached badge is **last observed state**. Persona
learns completion or failure when the conversation reconnects; it has no live
completion awareness while detached. With a status source, it observes that
execution until return, a terminal status, or cleanup. `completed` and `failed`
mean observed server outcomes. Reconnect exhaustion is a local attachment failure
and does not prove that server execution failed. Status observer exceptions do not
interrupt navigation.

Stop and `run:finished` with `outcome: "cancel"` describe the **local** session.
Aborting a durable response is not a server cancellation request. This adapter
adds no server cancel endpoint; a host that needs server cancellation must perform
an explicitly authorized backend operation and observe its result separately.
The existing `reconnectStream`, `resume`, and `onExecutionState` contracts remain
available. `onExecutionState(null)` still clears the active local handle when a
conversation detaches; it is not a signal that server work ended. When the new
adapter is configured, conversation-aware native reattachments use it and suppress
automatic browser tool execution during replay.

Checkpoints and subscriptions are released on identity/provider changes, deletion
of the saved conversation, clearing/resetting chat history, device reset, and
widget destruction. Late callbacks from released subscriptions are ignored.
These checkpoints belong to the current widget instance; they do not add reload
persistence, cross-device synchronization, push notifications, or a scheduler.
The existing reload handshake above remains a separate host-owned API.
