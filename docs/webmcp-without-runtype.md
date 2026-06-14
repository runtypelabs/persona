# Using Persona's WebMCP with a direct AI SDK backend (no Runtype)

Persona's WebMCP support lets the agent call **page-defined tools** (registered
on `document.modelContext`). A common question: can that work against a **direct
[Vercel AI SDK](https://ai-sdk.dev) backend** instead of the Runtype API?

Yes, and there are two paths depending on whether you keep the Persona widget UI.

---

## The coupling that decides the path

The widget owns the WebMCP loop internally: it snapshots page tools into
`clientTools[]`, and when the agent calls one it executes the tool on the page
and posts the result back. That loop is **bound to Runtype's proxy wire
protocol**: a `step_await` SSE event pauses the run, and the widget POSTs the
tool output to `${apiUrl}/resume` to continue. The control events
(`step_await` / `executionId` / `/resume`) are hard-coded to Runtype's field
names; `parseSSEEvent` / `customFetch` can adapt *content* framing but cannot
remap them.

So:

- **Keep the Persona widget UI** → your backend must **speak Runtype's proxy
  protocol**. Build a thin shim over the AI SDK (Path A).
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

### The wire contract your shim emits

Each SSE frame is `event: <type>\ndata: <json with matching "type">`.

| Widget expects | JSON |
| --- | --- |
| text delta | `step_chunk` → `{type, id, executionId, text}` |
| text done | `step_complete` → `{type, id, result:{response}}` |
| **WebMCP call** | `step_await` → `{type, awaitReason:"local_tool_required", toolName:"webmcp:<bare>", toolId, toolCallId, executionId, parameters}` |
| turn done | `flow_complete` → `{type, success:true, executionId}` |
| failure | `error` → `{type, message}` |

Two rules that bite if missed:

1. **`toolName` must carry the `webmcp:` prefix.** The widget routes a call to
   its bridge only when `isWebMcpToolName(toolName)` is true. The bridge strips
   the prefix to look the tool up on the page.
2. **Don't emit `flow_complete` when pausing for a tool.** A `step_await` ends
   the HTTP stream; the widget runs the tool and POSTs to `/resume`. Emitting
   `flow_complete` would end the turn instead.

### Resume

```
POST ${apiUrl}/resume
{ "executionId": "...", "toolOutputs": { "<toolCallId>": <WebMcpToolResult> }, "streamResponse": true }
```

`toolOutputs` is keyed by the `toolCallId` you emitted in `step_await` (falling
back to `toolName`). A `WebMcpToolResult` is `{content:[{type:"text",text}], isError?}`.
The resume response streams the continued turn with the **same** SSE protocol: including another `step_await` if the model calls another tool.

### Mapping to `streamText`

The shim ([`app/api/chat/shim.ts`](../examples/ai-sdk-webmcp/app/api/chat/shim.ts))
is small:

- Build the widget's `clientTools[]` into an AI SDK `ToolSet` with `tool({
  description, inputSchema: jsonSchema(parametersSchema) })` and **no `execute`**
  No-execute tools are client-side, so the model's call streams out and the
  turn stops.
- Iterate `result.fullStream`: `text-delta` → `step_chunk`; `tool-call` →
  `step_await` (prefix the name, reuse the model's `toolCallId`), then pause.
- Persist the conversation (messages + pending calls + the tool definitions) keyed
  by a generated `executionId` so `/resume` can continue it.
- On resume, append a tool-result message (`{role:"tool", content:[{type:"tool-result",
  toolCallId, toolName, output:{type:"text", value}}]}`) and call `streamText`
  again, streaming identically until a turn finishes with no tool calls.

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
