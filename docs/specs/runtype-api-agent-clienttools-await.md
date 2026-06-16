# Spec: Agent-dispatch must support client/page tools (`clientTools[]`) and emit `agent_await`

**Repo to change:** `runtype-core` — `apps/api`, `packages/shared`. **Entirely server-side.**
**Status:** ready to implement. Anchors below were verified against `main` at time of writing — line numbers may drift, so grep the quoted strings.

> **Context (not work):** the real-world caller is a browser chat client that talks to `/v1/dispatch`
> through a thin proxy. It already sends `clientTools[]` on the agent payload and already renders
> `agent_await`. Nothing in the caller needs to change — this is purely the server half. You can
> reproduce and verify everything below with raw `/v1/dispatch` + `/v1/dispatch/resume` requests.

---

## TL;DR

When a request dispatches to a **server-pinned agent** (`{ agent: … }` payload) and carries
`clientTools[]` (browser/page tools, `origin: "webmcp" | "sdk"`), the **agent runtime ignores the
tools entirely**. The model is told "use your tools" but has none, so it streams a tool-call-shaped
JSON as plain assistant text and hallucinates the result. The **flow** runtime handles this case
correctly; the agent runtime never had the wiring.

Two coupled changes, both on the agent-dispatch path:

1. **Thread `clientTools[]` into the agent's tool set** (parity with the flow prompt-executor).
2. **Pause + emit `agent_await`** when the agent calls one of those client tools, and resume the
   agent loop when the result arrives via `/v1/dispatch/resume`.

They are one unit: (1) without (2) lets the agent *call* the tool but never *pause* for the client to
run it; (2) without (1) never fires because the agent has no client tool to call.

---

## Inbound request shape (what the agent runtime receives)

A server-pinned agent dispatch carrying page tools looks like this:

```json
{
  "agent": { "name": "…", "model": "…", "systemPrompt": "… always use the tools …" },
  "messages": [{ "role": "user", "content": "Find a waterproof trail shoe under $170" }],
  "options": { "streamResponse": true, "recordMode": "virtual" },
  "clientTools": [
    {
      "name": "search_products",
      "description": "Search the catalog by free-text query…",
      "origin": "webmcp",
      "pageOrigin": "https://store.example",
      "parametersSchema": {
        "type": "object",
        "properties": { "query": { "type": "string" } },
        "required": ["query"]
      }
    }
  ]
}
```

(`agent` may instead be `{ "id": "agent_…" }` for a saved agent. The agent definition itself owns
**no** tools — `clientTools[]` is the entire source of them, refreshed per turn.)

## How to reproduce (before the fix)

POST the payload above to `/v1/dispatch` and read the SSE stream.

- **Observed:** a run of `agent_turn_delta` frames whose text is the tool-call JSON
  (`{"tool":"search_products","arguments":{…}} …`) followed by a fabricated `{"results":[…]}`, then
  `agent_turn_complete`, then `agent_iteration_complete` with **`"toolCallsMade":0`**. No `agent_await`
  (or `step_await`) is ever emitted — there was never a real tool call to pause on.
- **Expected:** the agent issues a **native** `search_products` call, the runtime pauses and emits
  `agent_await`, a `/v1/dispatch/resume` with the tool result continues the loop, and the agent
  answers from the real results.

The same payload sent to a **flow** that forwards `clientTools[]` behaves correctly today — that path
is the reference implementation.

---

## Root cause (verified)

### The request already carries the tools — the gap is the agent runtime

The inbound `/v1/dispatch` request includes `clientTools[]` on the agent payload (see shape above);
this is confirmed at the wire. The caller is not the problem.

### Only the flow runtime consumes `clientTools` — the agent executor never reads them

Every `clientTools` consumer lives under `apps/api/src/lib/flow-execution/`:

- `record-flow-resolver.ts` (~419–424, ~506–521): threads `request.executionMetadata?.clientTools`
  into the flow execution context ("dispatches don't silently lose validated clientTools").
- `flow-execution/engine.ts` (~516–519, ~557): `clientTools: request.clientTools ?? request.executionMetadata?.clientTools`.
- `flow-execution/virtual-flow.ts`, `step-orchestrator.ts`: carry them across resume.
- `prompt-executor.ts`: resolves them into the prompt step's tool set with precedence
  `saved < runtimeTools < clientTools` (see `resolveToolDefinitions`, `flow-execution/types.ts` ~561).

`grep -rn "clientTools" apps/api/src/services/agent-executor.ts` → **no tool-assembly matches**. The
agent executor never reads dispatch `clientTools`, so they are dropped on the agent path.

### The agent executor's only pause path is approval — and it leaks flow vocab

`apps/api/src/services/agent-executor.ts` (~1481–1494) pauses **only** for approval, and forwards a
`step_await` to the client:

```ts
// Forward the step_await event to the client stream
streamWriter.write(`event: step_await\ndata: ${JSON.stringify({ type: 'step_await', … })}\n\n`)
```

There is **no local-tool (`local_tool_required`) pause** on the agent path at all.

---

## The flow path is the reference implementation to mirror

- `apps/api/src/lib/flow-execution/prompt-executor.ts`
  - `~3162`: emits a pause with `awaitReason: 'local_tool_required'` when the model calls a tool with
    no server-side executor (a client/page tool).
  - `~4373`: `if (chunk.type === 'local_tool_required' && chunk.localToolRequired) { … }` — captures
    `toolName` / `parameters` / per-call id and pauses.
- `apps/api/src/lib/flow-execution/step-orchestrator.ts` `~1699–1720`: provenance for
  `dispatch.clientTools[]` arrivals; sets `awaitReason: 'local_tool_required'`.
- `apps/api/src/lib/runtime-tools-utils.ts`: validation/admission — `admitApiKeyDispatchClientTools`
  (~834), `clientToolsPolicy` (~817), allowlist, name validation, namespace rules, `origin` handling.

The agent loop and the flow engine already share a resume path: approval-paused agents resume via
`runContinuationPipeline → flowEngine.resumeFlow` (`agent-executor.ts` ~2029–2030).

---

## Change A — thread dispatch `clientTools[]` into the agent's tool set

On the agent-dispatch path, after the existing validation/admission of `clientTools[]`
(`runtime-tools-utils.ts`), merge the admitted client tools into the agent's resolved tool set for
**every turn** of the loop, with the same precedence the flow uses (`saved < runtimeTools < clientTools`).

Requirements:

- The agent owns **no** client tools of its own — `clientTools[]` is the entire source (refreshed
  each turn).
- Honor `clientToolsPolicy` / allowlist identically to the flow path. Do not invent a second policy.
- Present client tools as **native, callable tools** (function/tool-calling), not as text
  instructions. The model emitting tool-call JSON as text is the exact failure we are fixing.
- Carry the validated `clientTools` across resume (mirror `virtual-flow.ts` / `step-orchestrator.ts`)
  so multi-tool / multi-turn conversations keep them available after each `/resume`.

---

## Change B — pause and emit `agent_await` on a client-tool call

When the agent calls a tool whose `origin` is `webmcp` or `sdk` (a client tool with no server-side
executor), the runtime must:

1. **Stop the loop** for that turn (same control flow as the approval pause) and **not** emit
   `agent_complete` (paused, not done).
2. Emit an **`agent_await`** event to the client stream (not `step_await`) conforming to
   `agentAwaitEventSchema`.
3. On `/v1/dispatch/resume` with the tool result, feed the result back and **continue iterating**.

### Wire contract: `agent_await`

From `packages/shared/src/utils/sse-event-schemas.ts` (`agentAwaitEventSchema`, ~241) — already
defined; honor it exactly:

| field | type | required | notes |
|---|---|---|---|
| `type` | `'agent_await'` | ✓ | literal |
| `executionId` | string | ✓ | from `baseAgentEvent` |
| `seq` | number | ✓ | from `baseAgentEvent` |
| `toolId` | string | ✓ | provider tool id (`toolu_…`); shared by parallel calls to the same tool |
| `toolCallId` | string | optional but **send it** | unique per call; the consumer addresses each paused call by this in `/resume` (core#3878). Required for parallel/batched calls. |
| `toolName` | string | ✓ | **BARE** name (e.g. `search_products`). Do **not** namespace it. |
| `parameters` | object | optional | the model's tool arguments |
| `awaitedAt` | string | ✓ | ISO timestamp |
| `origin` | `'webmcp' \| 'sdk'` | optional but **send it** | the consumer derives namespacing from this |
| `pageOrigin` | string | optional | echo the request's page origin when known |

> **Why bare `toolName` + `origin`:** the consumer normalizes the bare name to `webmcp:<name>` for
> `origin === 'webmcp'` before resolving the page tool. Namespacing upstream double-prefixes it.
> Match the schema: bare name + `origin`.

### Resume contract

The tool result is POSTed to `/v1/dispatch/resume` (routing: `apps/api/src/routes/dispatch.ts` +
`routes/agents/continuation-routes.ts`), addressing the paused call by `toolCallId`.

- **Reuse the flow local-tool resume contract** — the same request shape the flow path already
  accepts for a `local_tool_required` resume. Do not introduce a new resume envelope for agents.
- **Key difference from approval resume:** approval resume goes `runContinuationPipeline →
  flowEngine.resumeFlow` and **does not re-enter the agent loop** (`agent-executor.ts` ~2030). A
  **local-tool** resume must append the tool result and **continue the agent loop** (the model needs
  to see the result and produce the next turn / possibly call more tools). Verify the continuation
  pipeline can re-enter the agent loop with a tool result for agent dispatch; if it can't today, that
  re-entry is part of this work.
- Support **parallel client-tool calls** in one turn (multiple `agent_await` per turn, each with a
  distinct `toolCallId`); resume only continues once all are satisfied — mirror the flow behavior.

---

## Optional, same PR — stop leaking `step_await` for agent approval pauses

Separate from the demo fix: the agent path emits `step_await` for **approval** pauses
(`agent-executor.ts` ~1487). The intended model is **flow step pause → `step_await`; agent pause →
`agent_await`**, so observability can tell which runtime paused. Consider switching the agent approval
pause to `agent_await`.

**Caveat:** the consumer routes local-tool awaits on the presence of `toolName`. An approval
`agent_await` (no `toolName`) must remain distinguishable so it drives the approval UI, not a
tool-resume. If consumer coordination isn't confirmed, **keep approval as `step_await` for now** and
ship only the local-tool `agent_await` (Change B). The local-tool pause is the required, behavior-
fixing change; the approval rename is a nicety.

---

## Acceptance criteria

1. A dispatch to a server-pinned agent with `clientTools[]` makes the model issue **native tool
   calls** — `agent_iteration_complete.toolCallsMade ≥ 1` when a tool is needed; **no** tool-call JSON
   or fabricated results in `agent_turn_delta` text.
2. Each client-tool call emits a schema-valid `agent_await` (bare `toolName`, `origin`, `toolCallId`,
   `parameters`, ISO `awaitedAt`) and **halts** the stream (no premature `agent_complete`).
3. POSTing the tool result to `/v1/dispatch/resume` (flow-compatible shape, addressed by `toolCallId`)
   **resumes the agent loop**; the agent uses the real result and can call further tools or answer.
4. Parallel client-tool calls in one turn each get a distinct `toolCallId` and all resume correctly.
5. `clientToolsPolicy` / allowlist is enforced on the agent path identically to the flow path; tools
   outside the allowlist are not presented to the model.

## Test plan

- **Unit (agent executor):** given a payload with `clientTools[]` and a model that calls one, assert
  (a) the tool is in the resolved tool set, (b) an `agent_await` is emitted matching
  `agentAwaitEventSchema`, (c) the loop halts. Mirror the flow `local_tool_required` tests.
- **Unit (resume):** feeding a tool result by `toolCallId` re-enters the agent loop and produces a
  follow-up turn; parallel calls resume only when all are satisfied.
- **Policy:** a `clientTools[]` entry outside `clientToolsPolicy.allowlist` is rejected/omitted on the
  agent path (parity with the flow path).
- **Integration:** raw `/v1/dispatch` with a server-pinned agent + `clientTools[]` → `agent_await` →
  `/v1/dispatch/resume` → completion, asserting `toolCallsMade ≥ 1` and no text-fabricated tool calls.

---

## Key files / anchors (grep the strings; line numbers may drift)

- `apps/api/src/services/agent-executor.ts` — agent loop; approval pause + `step_await` emit (~1481–1494);
  shared resume via `runContinuationPipeline → flowEngine.resumeFlow` (~2029–2030). **Add tool
  threading + the local-tool pause here.**
- `apps/api/src/lib/flow-execution/prompt-executor.ts` — **reference impl**: `local_tool_required`
  emit (~3162) + handling (~4373).
- `apps/api/src/lib/flow-execution/step-orchestrator.ts` — `dispatch.clientTools[]` provenance +
  `local_tool_required` (~1699–1720).
- `apps/api/src/lib/flow-execution/{engine,virtual-flow,record-flow-resolver}.ts` — how the flow path
  threads + carries `clientTools` across resume.
- `apps/api/src/lib/runtime-tools-utils.ts` — `admitApiKeyDispatchClientTools` (~834),
  `clientToolsPolicy` (~817), validation/namespacing/allowlist. **Reuse for the agent path.**
- `packages/shared/src/utils/sse-event-schemas.ts` — `agentAwaitEventSchema` (~241),
  `stepAwaitEventSchema` (~608).
- `apps/api/src/routes/dispatch.ts`, `apps/api/src/routes/agents/continuation-routes.ts` — dispatch +
  resume routing.
