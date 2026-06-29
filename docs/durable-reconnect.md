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
`conversationId` are **host owned**: the widget never sees the `conversationId`, it
lives only in the closure you give to `reconnectStream` (and to `customFetch`).

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
- **`conversationId` is host owned.** The widget never receives it; it lives in
  your `reconnectStream` / `customFetch` closure and in your own persistence next
  to the resume handle.
- **The cursor is per durable row.** A single row that expands into several frames
  (some media or artifact rows) could in principle split on a TCP boundary; the
  widget advances the cursor only on fully-parsed frames to bound this. Plain text
  deltas, the common case, are one frame per row.
