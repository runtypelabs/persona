# Unified stream cleanup: research and implementation plan

Research date: September 6, 2026. Persona baseline: `f907eacd`, PR #436.
Status: implemented. The research below records the pre-change findings.

## Decision

Remove native handling for superseded Runtype wire formats. The API already
normalizes internal legacy events before clients receive them. Persona does not
need a second translator or speculative support for unavailable wire formats.

Keep published configuration, extension hooks, persisted user state, and the
current resume/history contract. Those have consumers independent of which SSE
vocabulary the API emits. This is the boundary for avoiding a major release.

## Evidence and its limits

I checked the deployed [OpenAPI document](https://api.runtype.com/v1/openapi.json),
the upstream implementation and tests on `runtypelabs/core`'s `staging` branch
(observed revision `bd91e84c16672c5474aeeaad3e973417054373d7`), Persona's consumers,
first-party adapters, and test fixtures. I also ran small reproductions against
Persona's built client and the canonical example emitter.

The source inspection corroborates the deployed contract; a staging revision
alone does not prove which exact code is deployed. I did not run authenticated
production executions. Claims about observed widget behavior below come from
local reproductions, not production traffic.

The current OpenAPI union has 36 variants. Older shipped documents say 33;
their event count is historical, while the unified-only cutover remains relevant.
All four dispatch/chat/resume endpoints reference the same union:
`/v1/dispatch`, `/v1/dispatch/resume`, `/v1/client/chat`, `/v1/client/resume`.

Upstream evidence:

- [Unified-only cutover, July 23](https://github.com/runtypelabs/core/blob/bd91e84c16672c5474aeeaad3e973417054373d7/docs/features/shipped/2026-06-16-unified-sse-event-vocabulary.md): old query parameters, version headers, and rollout settings no longer select a stream vocabulary.
- [API edge translator](https://github.com/runtypelabs/core/blob/bd91e84c16672c5474aeeaad3e973417054373d7/apps/api/src/lib/unified-event-stream.ts): converts `dispatch_error` to `execution_error`; normalizes tool IDs and payload fields; emits canonical reasoning channels; converts `tool_error` to `tool_complete` with `success: false`.
- [Translator tests](https://github.com/runtypelabs/core/blob/bd91e84c16672c5474aeeaad3e973417054373d7/apps/api/tests/unified-sse-events.test.ts): cover dispatch-error translation, schema-valid output, durable awaits without tool IDs, and nested tool text/reasoning.
- [Unified-only smoke test](https://github.com/runtypelabs/core/blob/bd91e84c16672c5474aeeaad3e973417054373d7/.github/smoke-tests/sse-unified-only-wire-test.ts): probes old Persona headers and `?events=legacy` and requires unified lifecycle markers. I inspected this test; I did not execute its remote probes.
- [Current client initialization](https://github.com/runtypelabs/core/blob/bd91e84c16672c5474aeeaad3e973417054373d7/apps/api/src/routes/client.ts): accepts `durableRecovery`, supplies canonical conversation metadata, and still returns optional `flow` metadata.

## Findings

| Area | Evidence in Persona | Decision |
| --- | --- | --- |
| `dispatch_error` | Native branch in [client.ts](../packages/widget/src/client.ts); retained terminal-error test | Delete the branch and compatibility test. Do not add it to throughput tracking. Upstream translates it before transmission. |
| Alternate reasoning/tool IDs | `getStepKey`, `getToolCallKey`, `resolveReasoningId`, `resolveToolId`, and last-ID maps in [client.ts](../packages/widget/src/client.ts) | Use required reasoning `id` and tool `toolCallId`. Keep actual message maps and nested-block routing. |
| Legacy reasoning chunks | `reasoningText`, `text` delta aliases, `hidden`, `done`, `sequenceIndex`, and `insertOrderedChunk` | Consume `reasoning_delta.delta`; complete on `reasoning_complete`. Remove the old ordering buffer. Retain local duration measurement and current complete-event `text` fallback. |
| Tool payload aliases | `name`, `args`, output `text/message`, `agentContext`, `duration`, and generic timestamps | Read canonical `toolName`, `parameters`, `delta`, `executionTime`, and supported metadata. Preserve widget-facing duration fields when mapping current wire data. |
| Final tool arguments | `tool_input_complete` is explicitly ignored | Fix: final `parameters` must update the tool row. `tool_start.parameters` is optional; final parameters are required on input completion. |
| Failed tool results | `tool_complete` drops `success` and `error` | Separate bug fix: show the failure on the tool row without treating it as a terminal execution failure. |
| `transcript_insert` | Fullscreen demo **and** [fake-history-api.ts](../e2e/fixtures/fake-history-api.ts) emit it | Migrate both producers before deleting the native branch. Preserve the browser tests' display-projection behavior. |
| Private iteration state | `agentIterationMessages` is only written; several `agentExecution` fields are never read | Remove unused state. Preserve `iterationDisplay`, turn boundaries, and metadata actually used by messages. |
| Example wire drift | [Canonical emitter](../packages/persona-wire/src/index.ts), specialized AI SDK emitter, WebMCP shim | Align with the current schema; add conformance coverage. Loose `WireFrame` types currently allow missing required fields. |
| REST compatibility | Init retries every HTTP 400 without `durableRecovery`; history accepts a nested `conversation` wrapper and alternate target ID sources | Separate small cleanup after stream work. Use canonical response fields, retain current capability and authorization handling. |
| Stale guidance | Public docs, example comments, session diagnostics still describe `step_await` or translated `agent_error` | Update active guidance to `await` and `execution_error`; leave historical changelogs alone. |

Three client reproductions:

1. `tool_start` without parameters → `tool_input_complete` with
   `{query: "hello"}` → `tool_complete`: the final tool row has no `args`.
2. `tool_start` → `tool_complete {success: false, error: "Search timed out"}`:
   the final row is complete but contains no failure information. The upstream
   translator explicitly produces this failure shape.
3. A `tool_complete` received without its earlier start produces a generated
   `tool-…` ID instead of the supplied `toolCallId`. This demonstrates a
   continuation/partial-stream weakness; it does not assert that every ordinary
   dispatch can omit the start.

The canonical example emitter also reproduced missing `role` on `turn_start`
and `turn_complete`, and missing `error.code` on its object-form
`execution_error`. Existing example summaries check event order, text, execution
IDs, and sequence monotonicity; they do not validate these required fields.

## Implementation order

### 1. Finish the small existing PR

Remove `dispatch_error` handling, its retained compatibility assertion, and the
compatibility promise in the changeset/PR description. Keep tests for terminal
`execution_error` and `error {recoverable: false}`, plus nonterminal recoverable
errors. Verify client status, message finalization, and throughput agree.

Delete the clearly unread iteration map and write-only private fields if they
remain a small diff. Correct directly affected comments. Preserve public type
exports. Use the existing widget patch changeset; keep the PR description simple.

### 2. Align producers and add useful contract coverage

Fix the canonical source in `packages/persona-wire`, then run
`pnpm sync:persona-wire`. It owns seven vendored runtime copies and seven test
helper copies. Update the intentional specialization in `examples/ai-sdk-next`
separately, plus the WebMCP shim and browser-generated streams that use the same
old assumptions.

Add a compile-time typed emitter or focused test-time schema check for native
fixtures: required discriminated fields, parameters, tool IDs, error shape, and
event order. Keep standalone examples dependency-free at runtime. Use a pinned
contract in ordinary tests; do not make CI depend on fetching a live API schema.
Do not change the public mock-frame helper signature just to require `seq`:
contract tests can wrap its composable frames in a complete envelope.

Use this coverage when replacing fixtures so tests stop validating accidental
legacy tolerance. Extra fields absent from a schema are not automatically
invalid JSON Schema; prioritize missing required fields and canonical reads.

### 3. Fix tool handling, then remove the redundant translation machinery

Start with failing regressions for final input parameters and canonical tool IDs.
Use `toolCallId` directly on all native tool channel events. Test interleaved
calls to the same tool and continuations that lack earlier start frames so the
last-seen ID cannot attach output to the wrong call.

Apply final input parameters to the existing row, including an empty object and
a final value that supersedes provisional start parameters. Keep streamed input
chunks as display data. Preserve artifact-tool suppression and nested-tool rows.

Then remove alternate IDs, old reasoning ordering, and superseded payload
aliases. Type the native handler with the existing generated
`RuntypeExecutionStreamEvent` union, incrementally by event family. Avoid a broad
parser rewrite or blanket runtime rejection of every nonconforming frame.
The raw SSE tap and public `parseSSEEvent` path remain available; unknown/custom
events must not become fatal because the native handler became typed.

Keep completion timestamps and durations in widget state by calculating local
times where the wire no longer provides them. Normalize canonical execution
time into the widget's existing duration fields rather than removing public
message properties as collateral cleanup.

Treat failed-tool presentation as its own focused fix: add optional failure
metadata while retaining the existing public status union, render the error in
the tool row, and allow subsequent model output. Adding a new status literal
could break exhaustive consumers; it is unnecessary for this fix.

### 4. Retire the fabricated transcript event

Move the fullscreen demo's initial assistant/user lines to existing controller
message injection. Keep its artifact stream canonical and verify one artifact
card, correct ordering, and the same final content.

Replace `divergentTurnStream` with unified text frames carrying structured model
content and configure the browser fixture's supported stream parser to derive
display content. Preserve stable message IDs or update assertions from actual
projected IDs. Keep both browser guarantees:

- [Projection roundtrip](../e2e/specs/05-projection-roundtrip.spec.ts): displayed text is saved and restored while model-only fields stay out of the transcript.
- [Pending projection invalidation](../e2e/specs/06-pending-projection-invalidation.spec.ts): a credential change discards an in-flight projection and prevents retry.

Only after those producers are migrated, delete `transcript_insert` and its
specific artifact-reference bookkeeping. Retain duplicate-artifact protection
that still serves real artifact events. Do not replace this event with another
undocumented native extension.

### 5. Simplify REST fallbacks in a separate patch

Remove the init HTTP-400 retry that assumes an older server rejected
`durableRecovery`. Verify a current invalid request produces one request and
surfaces its original error. Keep negotiation and policy checks for disabled or
absent capabilities, session expiry, and unavailable history.

Use canonical `targetId` and the flat history detail shape. Keep optional
`flow` metadata: the current API still returns it. Keep deprecated exported
response types/fields for source compatibility; use generated wire types
internally instead of narrowing the public API in this cleanup.

Test agent sessions, flow sessions, and the data-only init branch where
`targetId` legitimately is absent. Preserve nullable history target IDs and
server fixture coverage for missing/empty display projections.

## Explicitly retain

- **Resume identity and replay:** name-keyed `toolOutputs` remains accepted by
  the current dispatch-resume contract. `await` tool IDs are optional, including
  server-driven pauses with no tool at all. This differs from required IDs on
  ordinary tool channel events.
- **Opaque SSE cursors:** upstream replay docs specify IDs can be composite
  `<seq>.<subIndex>` strings. Pass them verbatim as `after`; deleting the old
  reasoning `sequenceIndex` buffer must not alter durable replay cursors.
- **Flow continuation inference:** a resumed stream can lack `execution_start`.
  Keep current `stepType`-based flow detection and structured final-response
  reconciliation. Unified events still describe both flows and agents.
- **Current nested/media/artifact features:** retain `parentToolCallId`, media
  rendering, final reasoning text, artifact updates, and current `custom` events.
  Some artifact/custom variants have optional execution envelope fields; do not
  impose one universal required-envelope rule.
- **Published API and browser state:** configuration aliases, theme tokens,
  deprecated no-op options, injection methods, `parseSSEEvent`/`partId`, public
  type aliases, history state, and browser/WebMCP compatibility. None becomes
  unused merely because the Runtype stream changed.
- **Version observability:** `X-Persona-Version` is diagnostic metadata now.
  Removing format negotiation does not justify removing the header.
- **Output-token semantics:** total token scalars such as `tokensUsed` and
  `totalTokensUsed` are not exact output-token counts. Do not substitute them
  into throughput to compensate for removing old usage aliases.

Newer `subagent` metadata and `context_notice` have no dedicated native handling
today. That is a possible feature gap, not evidence of obsolete code. Keep their
raw observability and assess desired presentation separately from this cleanup.

## Validation and completion criteria

| Scenario | Required result |
| --- | --- |
| Terminal vs recoverable errors | Only terminal events end the run; no stale running throughput |
| Partial/interleaved tool channels | Stable per-call IDs; final arguments retained; no cross-call mutation |
| Tool failure followed by text | Failure visible on its row; execution can continue |
| Reasoning and nested tool blocks | Correct text, ordering, completion, and parent placement |
| Agent and flow resume without start | No duplicate assistant messages or wrong execution-kind routing |
| Durable reconnect | Composite cursor roundtrip; no skipped/duplicated content |
| Fullscreen artifacts | Correct transcript ordering and one reference card |
| Display-projection browser tests | Both existing privacy/continuity assertions still pass |
| Init/history | Current success, disabled-capability, expiry, and authorization behavior retained |
| Extension/public API smoke | Custom parser, injection, config aliases, and public exports still work |

Run focused regressions as each behavior changes. Before publication run
`pnpm verify` (build, lint, typecheck, full root tests), build the web preview,
and run the two affected projection browser specs. Also exercise the fullscreen
artifact and ask-user-question demos. Check all vendored helpers are synchronized.

Use patch changesets for published package fixes; include a proxy changeset only
if files in that package change. Check public declarations for accidental export
removal or narrowing. Update active docs so they no longer instruct users to emit
unavailable events. Keep historical release notes intact.

## Implementation result

The native handler now uses the generated event union. Obsolete event branches,
ID aliases, reasoning ordering, payload fields, unread iteration state, and REST
fallbacks have been removed. Canonical tool arguments, IDs, failure details, and
output-token metrics are covered by regressions. Example emitters, the fullscreen
demo, and projection fixtures use the current protocol.

Validation passed: package builds, lint, type checks, all root tests (3,875 widget,
47 proxy, 223 web, and all included example suites), adapter type checks, web
preview build, both projection browser tests, and browser smoke checks for the
fullscreen artifact and suggested-reply loop. Public exports/status unions remain
unchanged; tool failure fields are optional additions. Patch changesets cover
both published packages.

The changes are grouped into producer and consumer commits on PR #436 so the
fixture migrations remain reviewable alongside the removed handlers.
