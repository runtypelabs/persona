# Spec: Agent dispatch must keep ONE `executionId` across local-tool pause/resume

**Repo to change:** `runtype-core` — `apps/api`. **Entirely server-side.**
**Status:** follow-up to `runtype-api-agent-clienttools-await.md` (that change landed and works end-to-end). This tightens the **correctness** of the local-tool pause/resume path. Anchors were noted against `main` at time of writing — grep the quoted strings; line numbers drift.

> **Context (not work):** the caller is a browser chat client that talks to `/v1/dispatch` and resumes via `/v1/dispatch/resume`. It correlates and resumes purely by the `executionId` carried on the events — it follows whatever id the stream gives it. Nothing in the caller needs to change. This is purely a server-side correctness fix.

---

## TL;DR

A server-pinned **agent** dispatch that calls page/client tools (`clientTools[]`, `origin: "webmcp"`)
now pauses with `agent_await` and resumes correctly — the user gets the right answer. **But the
run's `executionId` switches identity at the first pause and never comes back:**

- The agent loop streams under `exec_…` (its real execution id).
- The moment it hits a local-tool pause, `agent_await` — and **every event after it**, through all
  resumes, the final `agent_turn_delta`s, and **`agent_complete`** — switch to a nested
  `virtual_…` id and stay there.

The agent's own `exec_…` execution is effectively **abandoned at the first pause**; a nested
`virtual_…` execution (the local-tool/flow machinery) carries the rest of the turn *and the
completion*. It produces correct output, so it's not user-visible — but it breaks executionId-based
correlation (logs, traces, consumers waiting for `agent_complete` on the agent's id).

**Required:** one `executionId` — the agent's `exec_…` — for the **entire** run: start, every turn,
every local-tool `agent_await`/resume, and `agent_complete`. The local-tool pause must be a pause
*within the agent loop*, and `/resume` must **re-enter the agent loop** under that id, not continue a
detached `virtual_…` flow execution.

---

## Observed behaviour (e2e, 2026-06-15)

Switchback WebMCP demo, "add both shoes to my cart" (two `add_to_cart` calls). Event stream, in order:

```
agent_start            executionId = exec_dfa82c9d-1734-4244-9813-5aa3ae69ceee
agent_iteration_start  exec_dfa82c9d…   iteration: 1, maxTurns: 8
agent_turn_start       exec_dfa82c9d…   iteration: 1, turnIndex: 0
agent_turn_delta       exec_dfa82c9d…
agent_tool_start       exec_dfa82c9d…   toolCallId: chatcmpl-…
agent_tool_input_*     exec_dfa82c9d…
agent_tool_start       exec_dfa82c9d…   (second add_to_cart)
agent_tool_input_*     exec_dfa82c9d…
agent_await            executionId = virtual_1781574599723_gljgv7bqa   ← SWITCHES HERE
                       toolId: runtime_webmcp:add_to_cart_178157460039…
-- /resume --
agent_turn_delta       virtual_1781574599723_gljgv7bqa
agent_tool_start       virtual_1781574599723_gljgv7bqa
agent_await            virtual_1781574599723_gljgv7bqa
-- /resume --
agent_turn_delta  … "Added both shoes to your cart … Cart total: $288"   virtual_1781574599723…
agent_turn_complete    virtual_1781574599723_gljgv7bqa   iteration: 1
agent_complete         virtual_1781574599723_gljgv7bqa   agentId: "virtual", success: true
```

Two anomalies:

1. **`executionId` identity switch.** `exec_dfa82c9d…` (agent loop) → `virtual_1781574599723…`
   (nested execution) at the first `agent_await`, permanent through `agent_complete`.
2. **`iteration` never advances past `1`** across multiple tool calls and resumes. Possibly correct
   for "one model turn that called several local tools," but verify it isn't "the agent loop isn't
   advancing because the virtual execution owns the run." (See "Verify," below.)

---

## Likely root cause (for the implementer to confirm)

A local/client tool call inside an agent turn appears to be executed through the flow/prompt-executor
`local_tool_required` machinery (`apps/api/src/lib/flow-execution/prompt-executor.ts` ~3162/4373),
which runs as a **virtual flow execution** with its own id (`virtual_<ms>_<rand>`). The pause, the
`/resume`, and the subsequent turns are all handled in that virtual execution context, so:

- `agent_await` is emitted with the **virtual** execution's id (not the agent's `exec_…`).
- `/resume` resumes the **virtual flow** (e.g. via `runContinuationPipeline → flowEngine.resumeFlow`,
  `apps/api/src/services/agent-executor.ts` ~2029–2030) and the virtual execution carries the rest of
  the conversation — it never hands control back to the agent loop, so `agent_complete` also fires
  under `virtual_…`.

In other words: the local-tool resume **continues the nested flow execution** instead of
**re-entering the agent loop** — the exact caveat called out in `runtype-api-agent-clienttools-await.md`
(Change B, "Key difference from approval resume"). It "works" because the virtual execution can carry
the whole turn; it's wrong because the agent's execution identity is lost.

---

## Required behaviour

For the **entire** lifetime of one agent dispatch, every event MUST carry the **agent's** execution
id (`exec_…`): `agent_start` … `agent_iteration_*` … `agent_turn_*` … **`agent_await`** … (resume) …
`agent_turn_*` … `agent_tool_*` … **`agent_complete`**.

1. **`agent_await.executionId` = the agent's `exec_…`** (from `baseAgentEvent`), not the nested
   execution's id. If the local-tool call must run under a nested execution internally, that's an
   implementation detail — the **wire** id stays the agent's throughout.
2. **`/resume` re-enters the agent loop** under `exec_…`: inject the tool result, continue the loop,
   and emit subsequent turns + `agent_complete` under `exec_…`.
3. **`agent_complete.executionId` = `exec_…`** — the same id `agent_start` used.
4. Multiple local-tool pause/resume cycles in one run all stay on the same `exec_…`.

`toolId` / `toolCallId` may keep their internal shape (e.g. `runtime_webmcp:<name>_<ms>`); only the
event **`executionId`** must be the agent's.

---

## Acceptance criteria (observable on the wire)

1. In a dispatch that pauses for a local tool, `agent_await.executionId` **equals**
   `agent_start.executionId` (an `exec_…`, not a `virtual_…`).
2. After `/resume`, all continuation events (`agent_turn_*`, `agent_tool_*`, further `agent_await`s)
   and the final **`agent_complete`** carry that **same** `exec_…`.
3. A run with N local-tool pauses emits exactly one execution identity end to end; grepping the
   stream for distinct `executionId`s yields **one** value.
4. `agent_complete` is emitted under the agent's `exec_…` with `success: true` (unchanged behaviour,
   corrected id).

## Verify (may already be correct)

- **`iteration` progression:** confirm the intended semantics. If a single model turn calls several
  local tools across pauses, `iteration: 1` throughout is fine. If the model is re-invoked after each
  tool result (a new reasoning turn), `iteration` should advance — and "stuck at 1" would indicate the
  agent loop's turn counter isn't running because the virtual execution owns the run. Decide which is
  intended and make the wire reflect it. (`maxTurns` budgeting depends on this being correct.)

---

## Key files / anchors (grep the strings; line numbers drift)

- `apps/api/src/services/agent-executor.ts` — agent loop; owns `exec_…`; approval-pause + resume via
  `runContinuationPipeline → flowEngine.resumeFlow` (~2029–2030). The local-tool pause/resume must
  drive *this* loop and keep its execution id on the wire.
- `apps/api/src/lib/flow-execution/prompt-executor.ts` — `local_tool_required` pause emit (~3162) +
  handling (~4373): where the nested execution + pause currently originate.
- `apps/api/src/lib/flow-execution/virtual-flow.ts` — virtual flow execution + `virtual_<ms>_<rand>`
  id generation and resume-carry; likely where the id is currently sourced from.
- `apps/api/src/routes/dispatch.ts`, `apps/api/src/routes/agents/continuation-routes.ts` — dispatch +
  resume routing; ensure an agent-dispatch resume re-enters the agent loop, not just the virtual flow.
- `packages/shared/src/utils/sse-event-schemas.ts` — `agentAwaitEventSchema` (~241), `baseAgentEvent`
  (`executionId`, `seq`); `agentCompleteEventSchema`.

## Relationship to the first spec

This is the correctness follow-up to **Change B** in `runtype-api-agent-clienttools-await.md`. That
spec made the agent path pause/resume on local tools at all; this one makes the run keep a single,
correct execution identity while doing so. The caller (Persona widget) already works with either — it
just follows the wire — so shipping this only improves server-side correlation/observability.
