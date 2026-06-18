# Using Persona's WebMCP with AI SDK

Persona's WebMCP support lets the agent call **page-defined tools** (registered
on `document.modelContext`). A common question: can that work against a **direct
[Vercel AI SDK](https://ai-sdk.dev) backend** instead of the Runtype API?

Yes, and there are two paths depending on whether you keep the Persona widget UI.

---

## The coupling that decides the path

The widget owns the WebMCP loop internally: it snapshots page tools into
`clientTools[]`, and when the agent calls one it executes the tool on the page
and posts the result back. That loop runs over **Persona's neutral unified wire
protocol** (vendor-neutral — the same wire the Runtype API emits): an `await` SSE
event pauses the run, and the widget POSTs the tool output to `${apiUrl}/resume`
to continue. The control events (`await` / `executionId` / `/resume`) are part of
that protocol; `parseSSEEvent` / `customFetch` can adapt *content* framing but the
pause/resume contract is fixed.

So:

- **Keep the Persona widget UI** → your backend must **speak Persona's unified
  protocol** (the widget consumes it natively). Build a thin shim over the
  AI SDK (Path A).
- **Don't need the widget UI** → reuse just the transport-agnostic
  `WebMcpBridge` and drive the AI SDK's **native** client-tool loop (Path B).

---

## Path A: keep the widget, shim the protocol (recommended for "drop-in")

A runnable example lives at [`examples/ai-sdk-webmcp/`](../examples/ai-sdk-webmcp/)
(live at [ai-sdk-webmcp.persona-chat.dev](https://ai-sdk-webmcp.persona-chat.dev))
The Switchback storefront with the real Persona widget, backed by two AI SDK
route handlers. Point the widget at your own endpoint in **proxy mode**:

```ts
createAgentExperience(el, {
  apiUrl: "/api/chat/dispatch", // resume is POSTed to `${apiUrl}/resume`
  webmcp: { enabled: true, autoApprove: (i) => READ_ONLY.has(i.toolName) },
  // ...theme, copy, launcher
});
```

> Your shim must speak the unified vocabulary on **both** the dispatch stream and
> the `/resume` continuation — a `/resume` stream continues mid-run with no
> `execution_start` frame, so the wire format has to be unified throughout. The
> widget consumes it natively (no per-widget opt-in).

### The wire contract your shim emits

Each SSE frame is `event: <type>\ndata: <json with matching "type">`.

Each frame carries one `exec_…` `executionId` for the whole run.

| Widget reads | JSON |
| --- | --- |
| run start | `execution_start` → `{type, executionId, kind:"agent", agentId, startedAt}` |
| turn open | `turn_start` → `{type, executionId, id:"turn_…", iteration}` |
| text delta | `text_start`·`text_delta`·`text_complete` → `{type, executionId, id:"text_…", delta, iteration}` |
| **WebMCP call** | `await` → `{type, executionId, toolName:"<bare>", origin:"webmcp", toolId, toolCallId, parameters, awaitedAt}` |
| turn done | `turn_complete` + `execution_complete` → `{type, executionId, kind:"agent", success:true, completedAt}` |
| failure | `execution_error` → `{type, executionId, kind:"agent", error:{message}}` |

Three rules that bite if missed:

1. **`await` carries a BARE `toolName` plus `origin:"webmcp"`.** The widget bridge
   applies the `webmcp:` prefix and routes the call to its WebMCP bridge (which
   strips the prefix to look the tool up on the page). Key the pause by
   `toolCallId` so two parallel calls to the same tool stay distinct.
2. **Don't emit `turn_complete`/`execution_complete` when pausing for a tool.** An
   `await` ends the HTTP stream; the widget runs the tool and POSTs to `/resume`.
   Emitting a completion frame would end the turn instead.
3. **Announce `kind:"agent"` on `execution_start`, and mean it.** A `/resume`
   continuation has no `execution_start` to re-announce the kind; the widget
   bridge defaults a fresh stream to `kind:"agent"`. If your backend is a real
   agent that matches by construction. A backend that wrapped an agent in a
   virtual *flow* (`kind:"flow"`) would mis-route resume tool events unless it
   re-announced its kind on the resume stream.

### Resume

```
POST ${apiUrl}/resume
{ "executionId": "...", "toolOutputs": { "<toolCallId>": <WebMcpToolResult> }, "streamResponse": true }
```

`toolOutputs` is keyed by the `toolCallId` you emitted in `await` (falling back to
`toolName`). A `WebMcpToolResult` is `{content:[{type:"text",text}], isError?}`.
The resume response streams the continued turn with the **same** protocol — the
**same** `executionId`, a fresh `turn_start` at an advanced `iteration`, and
another `await` if the model calls another tool.

### Mapping to `streamText`

The shim ([`app/api/chat/shim.ts`](../examples/ai-sdk-webmcp/app/api/chat/shim.ts))
is small:

- Build the widget's `clientTools[]` into an AI SDK `ToolSet` with `tool({
  description, inputSchema: jsonSchema(parametersSchema) })` and **no `execute`**
  No-execute tools are client-side, so the model's call streams out and the
  turn stops.
- Open each turn with `turn_start`, then iterate `result.fullStream`: `text-delta`
  → `text_start`/`text_delta` (lazily opening the text block); `tool-call` →
  `await` (bare name + `origin:"webmcp"`, reuse the model's `toolCallId`), then
  pause. Close the text block with `text_complete` before pausing or completing.
- Persist the conversation (messages + pending calls + the tool definitions +
  the current `iteration`) keyed by a generated `exec_…` `executionId` so
  `/resume` can continue it under the same id.
- On resume, append a tool-result message (`{role:"tool", content:[{type:"tool-result",
  toolCallId, toolName, output:{type:"text", value}}]}`) and call `streamText`
  again at `iteration + 1`, streaming identically until a turn finishes with no
  tool calls (`turn_complete` + `execution_complete`).

State between dispatch and resume must outlive a single request and be reachable
from a different instance (the two are separate HTTP requests). The example keys
it by `executionId` in the **Vercel Runtime Cache** (`@vercel/functions`), with an
in-memory fallback for local dev, but that cache is **ephemeral and
region-scoped**, so production should use a durable store (Redis/Upstash, Vercel
KV, a DB, or a Durable Object). The widget's resume request only sends
`{executionId, toolOutputs}` (not the message history), so server-side shared
state is required regardless of backend.

---

## Path B: reuse just the bridge (no widget UI)

If you're building your own UI, skip the protocol entirely. `WebMcpBridge` is a
public export and imports nothing Runtype-specific:

```ts
import { WebMcpBridge } from "@runtypelabs/persona";

const bridge = new WebMcpBridge({ enabled: true, onConfirm });

// advertise page tools to your AI SDK backend each turn
const clientTools = await bridge.snapshotForDispatch(); // ClientToolDefinition[]

// in the AI SDK's native client-tool hook
useChat({
  async onToolCall({ toolCall }) {
    return bridge.executeToolCall(toolCall.toolName, toolCall.input);
  },
});
```

Here the AI SDK owns the loop (its auto-resubmission replaces `/resume`) and the
bridge owns discovery, execution, and the human-approval gate. `parametersSchema`
is plain JSON Schema, so it maps directly via the AI SDK's `jsonSchema()` helper.
