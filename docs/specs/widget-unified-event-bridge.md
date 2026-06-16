# Widget Unified-Event Bridge — Spec

Status: **proposed** · Target: **`@runtypelabs/persona` 3.36.0 (minor, opt-in)** · Author scope: widget only
Companion to the runtype-core `createUnifiedEventWrite` translator (the api-side encoding of the
merged SSE spec). This document is its **inverse**: how the widget consumes the unified 33-event
vocabulary by mapping it back onto the legacy event handlers it already ships.

---

## 1. Purpose & strategy

The runtype-core API gained an **opt-in** edge translation: when a caller requests
`POST /v1/dispatch?events=unified`, the engine's legacy `agent_*` / `flow_*` / `artifact_*` frames are
re-encoded as a single **vendor-neutral 33-event vocabulary** (`execution_*`, `turn_*`, `text_*`,
`reasoning_*`, `tool_*`, `media_*`, `approval_*`, `await`, `step_*`, `artifact_*`, `source`, `custom`,
`ping`, `error`). No `agent_`/`flow_` prefixes — it is the cleanest candidate yet for *the* open
Persona wire protocol that every frontend (widget, future mobile/extension) and every backend adapter
can target.

This release ships the **consumer half** of that protocol at **minor-version risk**, without touching
the battle-tested render path:

- New opt-in `events: 'unified'` widget config (default `'legacy'` → **zero behavior change**).
- When enabled, incoming unified frames pass through a **stateful `unified → legacy` transducer**
  (`utils/unified-event-bridge.ts`) before the existing `client.ts` dispatch chain. The chain is
  **unchanged**.
- It is **inert until both** a site opts in **and** the API honors `?events=unified`, so it is safe to
  ship ahead of the API deploy.

Why a transducer and not native unified branches in the dispatch chain: the chain is ~1500 lines of
delicate interleaved state (`client.ts` ≈ 1842–3300). A transducer is a separate, pure, unit-testable
module — and we have the **exact inverse spec** (the api-side translator), so it is
**golden-round-trip testable**: `legacy corpus → api translator → unified → widget bridge` must be
semantically equal to the original legacy stream. It is also durable: it stays as the permanent
compat shim for any backend still emitting `agent_*`/`flow_*` — including our own open adapters.

### Scope: agent-first, flow best-effort

The neutral protocol path (and every adapter example + held demo) is **`kind: "agent"`**. The bridge
targets full fidelity there. **`kind: "flow"`** is Runtype's product dialect; the bridge supports its
lifecycle/steps/tools/approvals/artifacts but treats free-text reconstruction as best-effort (see
§5 FLOW rows). The round-trip golden test focuses on agent streams.

---

## 2. Where it sits in `client.ts`

Single integration point — the decode→buffer boundary:

```
client.ts:3367  payloadType = eventType !== "message" ? eventType : payload.type ?? "message"
client.ts:3371  this.onSSEEvent?.(payloadType, payload)   // raw-wire tap (event inspector)
client.ts:3374  if (this.parseSSEEvent) { ...custom parser... }
client.ts:3393  seqBuffer.push(payloadType, payload)       // ← bridge inserts HERE
```

In unified mode, replace the bare push with:

```ts
if (wireMode === "unified") {
  for (const ev of bridge.push(payloadType, payload)) {
    seqReadyQueue.push(ev);   // bypass the reorder buffer — see §6
  }
  drainReadyQueue();
} else {
  seqBuffer.push(payloadType, payload);
  drainReadyQueue();
}
```

Ordering consequences, by design:
- The **`onSSEEvent` tap (3371) sees the raw unified frames** — correct: it is a wire inspector.
- A **custom `parseSSEEvent` (3374) also sees raw unified frames** — documented consumer
  responsibility; custom parsers and `events: 'unified'` are an advanced combination.
- The transducer feeds **legacy** `{payloadType, payload}` into the unchanged dispatch chain.

---

## 3. Config surface & wiring

### 3.1 Option

Add to the widget config and `InstallConfig`:

```ts
/** Wire vocabulary requested from the dispatch endpoint.
 *  'legacy' (default) — current agent_*/flow_* frames.
 *  'unified'          — opt into the neutral 33-event vocabulary (requires an API that
 *                       honors ?events=unified; falls back to legacy automatically if not). */
events?: 'legacy' | 'unified';
```

Default `'legacy'` ⇒ additive ⇒ **minor**, non-breaking.

### 3.2 URL param

When `events === 'unified'`, append `?events=unified` to **both**:
- the dispatch URL (`this.apiUrl`, used at `client.ts:815` / `:891`), and
- the resume URL (`${apiUrl}/resume`, see `client.ts:978`).

Use the api-side constants verbatim: `UNIFIED_EVENTS_QUERY_PARAM = "events"`, value `"unified"`.
Append with `URLSearchParams` so an existing query string is preserved.

### 3.3 Auto-detect (the safety net — both directions)

The `events` flag controls only the URL param. The **decode mode is auto-detected from the first
lifecycle frame**, so the flag is a *request*, not a commitment:

| First lifecycle frame | Decode mode |
|---|---|
| `execution_start` | **unified** |
| `agent_start` / `flow_start` / `step_start` | **legacy (passthrough)** |

- Site sets `events:'unified'` **before** the API supports it → API ignores the param, sends legacy →
  first frame is `agent_start` → bridge stays in passthrough. **No breakage.**
- Site forgets the flag but the upstream is unified-only → first frame `execution_start` → bridge
  engages defensively.

`execution_start` is unified-exclusive and `agent_start`/`flow_start` are legacy-exclusive, so the
discriminator is unambiguous. Until the first lifecycle frame arrives, buffer (or default to the
flag's value).

---

## 4. Module interface

`packages/widget/src/utils/unified-event-bridge.ts`

```ts
export type LegacyEvent = { payloadType: string; payload: Record<string, any> };

export class UnifiedToLegacyBridge {
  constructor(opts?: { executionId?: string });
  /** Translate ONE decoded frame → 0..N legacy events (in order). Pure w.r.t. its own state. */
  push(type: string, payload: Record<string, any>): LegacyEvent[];
}
```

Internal state (mirror of the api translator's, inverted):

| Field | Purpose |
|---|---|
| `kind: 'agent' \| 'flow'` | routes content channels (set by `execution_start`) |
| `executionId: string` | stamped onto legacy payloads that need it |
| `iteration: number` | last seen `iteration` (turn/tool frames), for legacy `agent_*` stamping |
| `openTurnId: string \| null` | current agent turn (from `turn_start`); the `turnId` agent text/thinking/tool-input need |
| `openStepId: string \| null` | current flow step (from `step_start`); the `id` flow text attaches to |
| `mediaBuffers: Map<id, {mediaType, role, toolCallId, parts: string[]}>` | buffer the `media_*` triad → one `agent_media` |

Each emitted legacy payload **copies the unified envelope `seq`** (`payload.seq = frame.seq`) — see §6.

---

## 5. The inverse mapping table

`✦` = stateful / lossy reverse — read the note. `∅` = intentionally dropped (no legacy handler;
information not rendered today). Field names on the right are exactly what the cited handler reads.

### 5.1 Lifecycle

| Unified | `kind` | Legacy `payloadType` → payload | Notes |
|---|---|---|---|
| `execution_start` | agent | `agent_start` → `{executionId, agentId, agentName, maxTurns, startedAt}` | set `kind='agent'`, `executionId`. Handler `client.ts:2739`. |
| `execution_start` | flow | — (state only) | ✦ no `flow_start` handler exists; record `kind='flow'`, `executionId`, emit nothing. |
| `turn_start` | agent | `agent_turn_start` → `{turnId:id, iteration}` | set `openTurnId=id`, `iteration`. Handler `:2766` reads nothing; ids carried for downstream. |
| `turn_complete` | agent | `agent_turn_complete` → `{turnId:id, iteration, stopReason, completedAt}` | clear `openTurnId`. Handler `:2813`. |
| `execution_complete` | agent | `agent_complete` → `{success, completedAt, stopReason, executionId}` | finalizes bubble + sets status idle. Handler `:3058`. |
| `execution_complete` | flow | `flow_complete` → `{success, completedAt, ...}` | Handler `:2656`. |
| `execution_error` | agent | `agent_error` → `{recoverable:false, error}` | ✦ surfaces `onEvent({type:'error'})` (`:3073`). **Verify**: if status-idle/finalize is also wanted, additionally emit `agent_complete{success:false}` (API emits no `execution_complete` on failure). |
| `execution_error` | flow | `flow_error` → `{error, code, upgradeUrl}` | terminal branch `:3288`. |
| `error` (`recoverable:true`) | * | `agent_error` → `{recoverable:true, error}` | ✦ **must** use `agent_error` (warns, non-terminal, `:3077`), **never** legacy `error` (that branch `:3289` is terminal). |
| `ping` | * | `agent_ping` → `{timestamp}` | no-op keepalive (`:3088`); may be dropped. |

### 5.2 Text channel (`text_start` / `text_delta` / `text_complete`)

| Unified | `kind` | Legacy → payload | Notes |
|---|---|---|---|
| `text_start` | agent | — (set `openTextBlockId=id`) | ✦ agent bubble is created lazily by the first delta. |
| `text_delta` | agent | `agent_turn_delta` → `{contentType:'text', delta, turnId: openTurnId ?? id, iteration, executionId}` | ✦ unified decoupled the text block-id from `turnId`; recover via `openTurnId`, else fall back to the block `id` (any stable id works — handler `:2772` only uses it for grouping/stopReason). |
| `text_complete` | agent | — | sealed by `turn_complete` / next `agent_tool_start`. |
| `text_start` | flow | — (set `openTextBlockId=id`) | |
| `text_delta` | flow | `step_delta` → `{id: openStepId ?? id, text: delta, stepType:'prompt'}` | ✦ recover step association via `openStepId` (from `step_start`). `stepType` must not be `'tool'`/context or `:2166` skips it. |
| `text_complete` | flow | — | drop (avoid `text_end` which seals the agent-style bubble). |

### 5.3 Reasoning channel (`reasoning_start` / `reasoning_delta` / `reasoning_complete`)

| Unified | `kind` | Legacy → payload | Notes |
|---|---|---|---|
| `reasoning_start` | agent | — (set `openReasoningId=id`) | thinking renders via `agent_turn_delta`. |
| `reasoning_delta` | agent | `agent_turn_delta` → `{contentType:'thinking', delta, turnId: openTurnId ?? id, iteration, executionId}` | handler `:2785` keys reasoning by `turnId`. |
| `reasoning_complete` (`scope:'loop'` or has `text`) | agent | `agent_reflection` → `{reflection: text, executionId, iteration}` | ✦ the E3 reflection fold (`reasoning_start{scope:loop}`+`reasoning_complete{text}`) round-trips to `agent_reflection` (`:3036`). |
| `reasoning_complete` (turn-scoped) | agent | — | closed by `agent_turn_complete`. |
| `reasoning_start` | flow | `reason_start` → `{id}` | `resolveReasoningId` reads `reasoningId ?? id` (`:1511`). |
| `reasoning_delta` | flow | `reason_delta` → `{id, delta}` | handler reads `reasoningText ?? text ?? delta` (`:1876`). |
| `reasoning_complete` | flow | `reason_complete` → `{id}` (+ `reason_delta{id, delta:text}` first if `text` was not streamed) | `:1906`. |

### 5.4 Tool channel (`tool_start` / `tool_input_delta` / `tool_input_complete` / `tool_output_delta` / `tool_complete`)

| Unified | `kind` | Legacy → payload | Notes |
|---|---|---|---|
| `tool_start` | agent | `agent_tool_start` → `{toolCallId, toolName, parameters, executionId, iteration, startedAt}` | handler id = `toolCallId` (`:2860`); reads `toolName ?? name`, `parameters`. |
| `tool_input_delta` | agent | `agent_turn_delta` → `{contentType:'tool_input', delta, toolCallId}` | streams to tool chunks keyed by `toolCallId` (`:2801`). |
| `tool_input_complete` | agent | ∅ | args already set at `tool_start`; no handler. |
| `tool_output_delta` | agent | `agent_tool_delta` → `{toolCallId, delta}` | `:2882`. |
| `tool_complete` | agent | `agent_tool_complete` → `{toolCallId, result, executionTime, completedAt}` | reads `result`, `executionTime` (`:2894`). |
| `tool_start` | flow | `tool_start` → `{toolId: toolCallId, toolName, parameters, executionId, iteration, startedAt}` | `resolveToolId` reads `toolId ?? id` (`:1587`); handler reads `toolName ?? name`, `args ?? parameters` (`:1930`). |
| `tool_input_delta` | flow | ∅ | flow tools don't stream input to UI. |
| `tool_input_complete` | flow | ∅ | |
| `tool_output_delta` | flow | `tool_delta` → `{toolId: toolCallId, delta}` | reads `text ?? delta ?? message` (`:1966`). |
| `tool_complete` | flow | `tool_complete` → `{toolId: toolCallId, result, duration/executionTime, completedAt}` | `:1997`. |

> **Synthetic skill / propose tools (E2).** The api translator already emits `agent_skill_loaded` /
> `agent_skill_proposed` as ordinary `tool_start`+`tool_complete` with `result.kind`. They flow through
> the rows above and render as tool bubbles. ✦ Acceptable lossy: the bridge does **not** reconstruct
> the original `agent_skill_*` events.

### 5.5 Media channel — buffered triad → one `agent_media`

| Unified | Action |
|---|---|
| `media_start{id, mediaType, role, toolCallId}` | `mediaBuffers.set(id, {mediaType, role, toolCallId, parts:[]})`; emit nothing. |
| `media_delta{id, delta}` | `buffers.get(id).parts.push(delta)`; emit nothing. |
| `media_complete{id, mediaType, url, data, toolCallId}` | reconstruct **one** `MediaContentPart`, emit `agent_media` → `{media:[part], executionId, iteration, toolCallId}`, delete buffer. |

Part reconstruction (matches the shapes `agent_media` accepts, `client.ts:2920`):
- `data` present → `{type:'media', data, mediaType}`
- else `url` present → `{type: mediaType.startsWith('image/') ? 'image-url' : 'file-url', url, mediaType}`
- else joined `parts` non-empty → use as `url` (or `data` if it looks like base64/data-URI)

`media_complete` carries `url`/`data` directly, so `parts` is only a fallback.

### 5.6 Approvals (1:1)

| Unified | Legacy → payload | Notes |
|---|---|---|
| `approval_start` | `agent_approval_start` → `{approvalId, toolName, toolType, description, reason, parameters, executionId}` | `:3093`. |
| `approval_complete` | `agent_approval_complete` → `{approvalId, decision, executionId, toolName, description}` | `:3143`. |

### 5.7 Await — the local-tool / WebMCP pause ✦ — VERIFIED: ships in 3.36, no ported handler

`await{toolId, toolCallId, toolName, parameters, awaitedAt, origin, pageOrigin}` — the unified frame
carries **no `kind`** (the protocol collapses `step_await` / `agent_await` / `flow_await` into one
`await`). Map it onto the local-tool-pause path that **origin/main 3.35.0 already ships**:

```
await → step_await {
  awaitReason: 'local_tool_required',
  toolName: (origin === 'webmcp' && !isWebMcpToolName(toolName)) ? `webmcp:${toolName}` : toolName,
  parameters, toolCallId, toolId, executionId, awaitedAt
}
```

The bridge synthesizes the `webmcp:` prefix itself — the +35-line 4.0 `agent_await` change did this
*inside* the handler; the bridge does it *pre-dispatch*. **Both halves of the round-trip already exist
on origin/main 3.35.0** (verified 2026-06-16):

- **Render:** `client.ts:2050` — `step_await{awaitReason:'local_tool_required'}` upserts the tool
  bubble, calls `isWebMcpToolName`, sets `awaitingLocalTool:true`. Covers WebMCP page tools (status
  `running`, async page execution) **and** user-interaction local tools like `ask_user_question`.
- **Resume:** `session.ts` — `resumeFlow`, `webMcpToolCallId` keying, `toolOutputs`, the full
  `/resume` machinery — all shipped in 3.35.0, byte-identical to persona-4.0.

So the bridge delivers the **complete WebMCP pause → execute → `/resume` → continue round-trip in 3.36
with no ported handler.** The only gate is API-side (the upstream must honor `?events=unified` and
support agent resume) — the same WS1 deploy gate, not a widget gate.

The held 4.0 `agent_await` handler (`.changeset/agent-await-pause.md`) is needed **only** for **legacy
(non-unified) agent dispatch**, where the wire literally emits `agent_await`. The bridge never sees
that event (unified emits `await`), so that major is **irrelevant to the unified path** — see §9.

### 5.8 Steps (flow)

| Unified | Legacy → payload | Notes |
|---|---|---|
| `step_start` | `step_start` → pass through `{id, name, stepType, index, totalSteps, startedAt, outputVariable}` | set `openStepId=id`. |
| `step_complete` | `step_complete` → pass through `{id, name, stepType, success, durationMs, result, stopReason, completedAt, unresolvedVariables, fallback?}` | clear `openStepId`. `:2461`. |
| `step_skip` | ∅ | no `step_skip` handler in the widget. |

### 5.9 Artifacts (1:1)

| Unified | Legacy → payload |
|---|---|
| `artifact_start` | `artifact_start` → `{id, artifactType, title, component}` (`:3174`) |
| `artifact_delta` | `artifact_delta` → `{id, delta}` (`:3204`) |
| `artifact_update` | `artifact_update` → `{id, component, props}` (`:3214`) |
| `artifact_complete` | `artifact_complete` → `{id}` (`:3225`) |

### 5.10 Dropped (no legacy renderer)

| Unified | Why ∅ |
|---|---|
| `source` | no `source` handler; surfaced only via the `onSSEEvent` raw-wire tap. |
| `custom` (incl. `name:"runtype.fallback"`) | no fallback/custom renderer; the widget doesn't display fallback beats today. |

---

## 6. Sequencing / the reorder buffer

Each unified frame carries a monotonic envelope `seq`. The widget's `SequenceReorderBuffer`
(`client.ts:1827`) exists to reorder **out-of-order legacy multi-stream frames** by
`seq`/`sequenceIndex`. The unified stream is **single-connection and already in order**, so:

- **Recommended:** in unified mode **bypass the reorder buffer** — push the bridge's
  `{payloadType, payload}` outputs straight into `seqReadyQueue` and call `drainReadyQueue()`
  (the chain consumes them in arrival order). This sidesteps any tie-break question for `1→N`
  expansions (only `agent_media` is many→one; nothing is one→many).
- **Alternative:** keep the buffer and copy `payload.seq = frame.seq` onto each emitted legacy
  payload. Requires confirming `SequenceReorderBuffer` preserves stable insertion order for equal
  `seq`. **Verify before choosing this.**

Legacy intra-message ordering hints (`payload.sequenceIndex` in `reason_delta`, `:1882`) are absent in
unified frames; the handlers already fall back to append order (`:1888`), which is correct for an
in-order stream.

---

## 7. Test plan

1. **Golden round-trip (the centerpiece).** Vendor a copy of the api-side
   `createUnifiedEventWrite` translator as a **test oracle** (`*.fixture.ts`, not shipped). For a
   corpus of legacy agent streams (text-only; text+tool; tool+media; reasoning; approval;
   local-tool await; multi-iteration):
   `legacy frames → oracle → unified frames → UnifiedToLegacyBridge → legacy frames'`.
   Assert `legacy'` is **semantically equal** to the original (modulo the documented ✦ lossy bits:
   text/reasoning block-id reassociation, synthetic skill tools, single-shot media, dropped
   `source`/`custom`/`step_skip`/`tool_input_complete`).
2. **Per-family unit tests** on `bridge.push()` — one per row in §5, asserting exact emitted
   `{payloadType, payload}` shapes and state transitions (`kind`, `openTurnId`, `openStepId`, media
   buffering).
3. **Auto-detect tests** — first frame `execution_start` ⇒ unified; `agent_start` ⇒ passthrough even
   when `events:'unified'` was requested (API-not-updated window).
4. **Integration test** in `client.test.ts` — drive a captured **unified** SSE fixture through the
   client with `events:'unified'` and assert the same emitted messages as the equivalent legacy
   fixture (esp. the WebMCP await→resume round-trip; reuse the verified `ai-sdk-webmcp` capture).
5. **Regression guard** — the full existing suite (1276 tests) stays green: the default `'legacy'`
   path is untouched.

---

## 8. Release shape

- **`@runtypelabs/persona` minor → 3.36.0.** One changeset:
  `.changeset/unified-event-consumer.md` (`minor`): "Add opt-in `events: 'unified'` support: the widget
  can consume the API's neutral unified SSE vocabulary, bridged to the existing event handling. Default
  `'legacy'`; no behavior change unless enabled."
- **Branch off `origin/main` (3.35.0)** — independent of the three 4.0 majors; do **not** build it on
  the stale `persona-4.0` branch.
- Ships **inert**: needs both a site opt-in and an API that honors `?events=unified`.

---

## 9. 4.0 evolution (out of scope here, recorded)

With the transducer in place, 4.0 options open up cheaply:
- Flip the default to `'unified'` (the transducer keeps legacy backends working).
- Optionally promote native unified handling in the chain and retire legacy branches — the transducer
  remains as the legacy-compat shim for third-party adapters.
- **`agent_await` is vestigial under unified.** The held `.changeset/agent-await-pause.md` major exists
  only so the widget can render the **legacy** `agent_await` event from non-unified agent dispatch.
  Unified collapses every await into `await`, which the bridge already routes through the
  `step_await{local_tool_required}` path 3.35.0 ships (§5.7). So a **unified-first** 4.0 may not need
  that handler at all — keep it only as long as legacy agent dispatch is supported. (It's +35 harmless
  lines; the point is it stops being a *gating* item.)
- **Strategic:** decide whether the unified vocabulary becomes **the documented open Persona protocol**
  that the adapter examples emit (today they emit the `agent_*` vocab). This release ships the consumer
  side first — the low-risk way to start that convergence.

---

## 10. Verify-before-implement checklist

- [x] ~~Confirm whether the 3.36 base ships an `agent_await` handler.~~ **RESOLVED 2026-06-16:**
      origin/main 3.35.0 has **no** `agent_await` (true), **but** it *does* ship the
      `step_await{local_tool_required}` renderer (`client.ts:2050`) **and** the full `session.ts`
      resume path. So `await` maps to `step_await{local_tool_required}` and the WebMCP round-trip works
      in 3.36 with no ported handler (§5.7).
- [ ] `SequenceReorderBuffer` behavior for equal `seq` — only matters if **not** bypassing (§6).
- [ ] Exact terminal-UI behavior wanted for `execution_error{kind:agent}` — `agent_error` alone vs
      also `agent_complete{success:false}` (§5.1).
- [ ] `getStepKey` / `getToolCallKey` field reads (`client.ts`) — confirm the bridge populates whatever
      they key on for flow `reason_*` / `tool_*` (id is `id`/`reasoningId`/`toolId`; verify no
      additional `stepId` dependency).
- [ ] Custom `parseSSEEvent` + `events:'unified'` interaction — document that custom parsers receive
      raw unified frames (§2).
```