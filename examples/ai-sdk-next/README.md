# Persona Workspace · Vercel AI SDK and OpenAI Responses

A restrained, full-page chat workspace with Persona V5 defaults, real in-visit conversation navigation, and explicit Preview / Live modes. The two adapters plug existing SDK streams into Persona’s SSE protocol:

- **Vercel AI SDK**: wraps `streamText().fullStream`
- **OpenAI Responses SDK**: wraps `openai.responses.create({ stream: true })`

The adapters emit Persona's SSE event vocabulary
(`execution_start` / `turn_start` / `text_start`·`text_delta`·`text_complete` /
`turn_complete` / `execution_complete`). Any backend can speak this protocol, and it matches the
wire the Runtype API emits. The widget consumes the wire natively. The AI SDK
route adds the optional `tool_start` / `tool_complete` pair for follow-up
suggestions.

The local adapter helpers live in `app/lib/` so they are easy to lift into a
future package export such as `@runtypelabs/persona-proxy/adapters`.

## Run

```bash
pnpm --filter @runtypelabs/persona build
pnpm --filter ai-sdk-next dev
```

Open `http://localhost:3000`. **Preview is the default and requires no API key.**

The preview contains illustrative launch research, never live research. The AI SDK
path runs a deterministic `LanguageModelV4` through the real `streamText()` loop:
reasoning, three executed in-memory tools, then a streamed final answer. The OpenAI
path uses the official SDK with a local `fetch` fixture, then the production
Responses adapter, preserving commentary and final-answer phases. The provider
selector selects the corresponding preview path as well as the live path.
The three starter prompts select research, comparison, and checklist scenarios.
Other prompts use the sample research answer. Preview tools only read bundled data;
`check_readiness` evaluates an in-memory checklist and never runs a shell command.

To enable **Live**, configure server-only credentials and restart the app:

```bash
cp examples/ai-sdk-next/.env.example examples/ai-sdk-next/.env.local
# Set OPENAI_API_KEY in .env.local; optionally set the model variables below.
pnpm --filter ai-sdk-next dev
```

Live is visibly unavailable until the server has a key. Preview never silently
falls back to live or consumes provider credits. Each new conversation retains
its own mounted Persona instance, transcript, provider, and mode for this visit;
refreshing the page clears the in-memory history. Switching modes/providers opens
a new conversation so incompatible histories are never mixed.

The workspace uses `future: { v5Defaults: true }`, embedded layout, and turn activity.
Tool and reasoning detail uses V5’s bounded overflow and muted default icons.
The greeting/composer moves from the centered empty state to a conversation on
first message. On mobile, the same real conversation list opens as a drawer.

Validated dependency baseline: AI SDK 7, `@ai-sdk/openai` 4, OpenAI SDK 7, Next.js 16,
React 19, Zod 4. Exact compatible ranges are in `package.json`. Provider protocol
fixtures use the current V4 interface. Reference: [AI SDK streaming](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text),
[AI SDK testing](https://ai-sdk.dev/docs/ai-sdk-core/testing).

```bash
pnpm --filter ai-sdk-next lint
pnpm --filter ai-sdk-next test
pnpm --filter ai-sdk-next build
```

The adapter tests run offline against a mocked model, so they need no API key:

```bash
pnpm --filter ai-sdk-next test
```

## Routes

| Route | SDK | Adapter |
| --- | --- | --- |
| `/api/preview/dispatch?adapter=ai-sdk` | Keyless AI SDK fixture | Real `streamText()` and `createAISDKPersonaHandler()` |
| `/api/preview/dispatch?adapter=openai-responses` | Keyless OpenAI fixture | Official SDK and `createOpenAIResponsesPersonaHandler()` |
| `/api/ai-sdk/dispatch` | Vercel AI SDK | `createAISDKPersonaHandler()` |
| `/api/openai-responses/dispatch` | Official OpenAI SDK | `createOpenAIResponsesPersonaHandler()` |

Both routes accept the normal Persona proxy-mode dispatch body:

```ts
{
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

Both routes return Persona-compatible SSE. The streamed `text_delta`s are
authoritative. You don't need to re-send the full text at the end, and one
`executionId` (`exec_…`) plus `kind:"agent"` are carried across the run:

```txt
event: execution_start
data: {"type":"execution_start","executionId":"exec_...","seq":0,"kind":"agent","agentId":"virtual","startedAt":"..."}

event: turn_start
data: {"type":"turn_start","executionId":"exec_...","seq":1,"id":"turn_...","iteration":1}

event: text_start
data: {"type":"text_start","executionId":"exec_...","seq":2,"id":"text_..."}

event: text_delta
data: {"type":"text_delta","executionId":"exec_...","seq":3,"id":"text_...","delta":"...","iteration":1}

event: text_complete
data: {"type":"text_complete","executionId":"exec_...","seq":4,"id":"text_..."}

event: turn_complete
data: {"type":"turn_complete","executionId":"exec_...","seq":5,"id":"turn_...","iteration":1,"stopReason":"end_turn","completedAt":"..."}

event: execution_complete
data: {"type":"execution_complete","executionId":"exec_...","seq":6,"kind":"agent","success":true,"completedAt":"..."}
```

## OpenAI message phases and turn activity

The OpenAI tab enables `turnActivity: { enabled: true }`. The Responses adapter
keeps each provider message and content part separate, using
`<item_id>:<content_index>` as the Persona text block ID and one stable
`executionId` for the request. If the provider supplies an assistant message
phase before its first text delta, the adapter copies it to `text_start.phase`:

| Phase | Placement with turn activity enabled |
| --- | --- |
| `commentary` | Inside the turn activity disclosure |
| `partial_answer` or `final_answer` | In the conversation |
| Missing or unknown | In the conversation |

The adapter does not classify text by its wording, message order, or completion
status. A completed commentary message remains commentary. Reasoning content is
not copied into assistant text.

OpenAI's assistant message phase is optional and depends on the model and
workflow. The default `gpt-4.1-mini` route remains useful as ordinary streaming
chat. To try a model supporting phases and a real hosted search, set these
server-side variables in `.env.local`, then restart the dev server:

```dotenv
OPENAI_RESPONSES_MODEL=gpt-5.4
OPENAI_RESPONSES_REASONING_EFFORT=low
OPENAI_RESPONSES_WEB_SEARCH=true
OPENAI_RESPONSES_MAX_OUTPUT_TOKENS=2048
```

Select **OpenAI Responses** and try: “Give me a brief progress update, then use
web search to find the official OpenAI Responses API documentation and summarize
what it says about streaming.” An update in prose does not guarantee provider
phase metadata. Hosted search emits a tool start when OpenAI adds the search
item, followed by its actual result and completion status. Function execution
and browser tools still require a separate execution/resume loop.

Placement is frozen when a text block begins. If a phase first arrives with
`response.output_item.done`, `text_complete.phase` preserves it as history-only
`agentMetadata.providerPhase`; already-visible text stays in place. Persona's
outbound assistant history uses the authoritative provider phase when known.
`personaMessagesToOpenAIInput()` preserves `commentary` and `final_answer` on
assistant history and never labels user messages. `partial_answer` is accepted
by the Persona wire but is not sent to OpenAI, whose documented input phase
values are `commentary` and `final_answer`.

Only `response.completed` completes a successful run. Provider failures,
incomplete responses (including token limits), and unexpected EOF terminate with
`execution_error`; cancelling the request or response reader aborts the provider
request. See OpenAI's [phase guidance](https://developers.openai.com/api/docs/guides/reasoning#phase-parameter)
and [streaming event reference](https://developers.openai.com/api/reference/resources/responses/streaming-events).

## Follow-up suggestions

The AI SDK route also shows the model-driven path to Persona's quick-reply
chips. Three pieces, all in `app/lib/ai-sdk-adapter.ts`:

1. A tool named `suggest_replies`, defined with the AI SDK's
   `tool({ inputSchema: jsonSchema(...) })` using the same parameters schema the
   widget ships: 1 to 4 items of `{ label, prompt?, description? }`. Its
   `execute` returns a canned "Suggestions shown to the user." result, because
   nothing actually runs.
2. A steering line appended to the system prompt: "after answering, offer 2-3
   follow-up suggestions with the suggest_replies tool, phrased in the user's
   voice". The tool description is passive; this instruction is what drives how
   often the model calls it.
3. A branch in the `fullStream` loop that maps the `tool-call` part onto
   `emit.toolCall(...)`, which writes `tool_start` (carrying the arguments on
   `parameters`) followed immediately by `tool_complete`.

The call is fire-and-forget: no pause, no `/resume` endpoint, and no widget
config. Chip rendering is transcript-derived, so any `suggest_replies` tool call
on the wire renders chips while `suggestions.followUps` is at its default
(`enabled: true`).

Four things worth knowing:

- Arguments must ride `tool_start.parameters`. The `tool_input_delta` frames are
  display-only, so streaming arguments incrementally never fills them in.
- Omit `origin` on these frames. The widget reads it on `await` frames only,
  where `origin: "webmcp"` renames the tool to `webmcp:suggest_replies` and
  routes it to the page-tool bridge; `tool_start` ignores the field, so omitting
  it is the rule that holds either way.
- The stream must reach `execution_complete`, otherwise the chips render but
  stay permanently disabled.
- `stopWhen: stepCountIs(1)` is `streamText`'s documented default. Passing it
  explicitly only makes the single-step loop visible: a fire-and-forget result
  has nothing to feed back to the model, so there is no second step to stop.

To let the widget advertise the tool instead (`suggestions.followUps.expose:
true`), read `body.clientTools` and build the tool set from it. See the comment
above `createAISDKPersonaHandler` and `buildTools()` in
`examples/ai-sdk-webmcp/app/api/chat/shim.ts`, minus its `origin: "webmcp"`
hardcode. For a keyless, offline version of the same wire, see
`examples/echo-hono`.

## Choosing a model/assistant with `target`

The routes above hardcode one model per route: the simplest setup, and all most
apps need. If you want the **browser to choose** the model or assistant, use the
widget's normalized `target` field plus a `targetProviders` resolver. The
resolver runs in the browser and maps a friendly string to extra wire fields;
your route reads them and constructs the model server-side. (The resolver is a
wire mapping, not a model factory: model instantiation stays on the server.)

Mount the widget with a `target` and a resolver:

```ts
import { createAgentExperience } from "@runtypelabs/persona";

createAgentExperience(host, {
  apiUrl: "/api/ai-sdk/dispatch",
  target: "openai:gpt-4.1-mini",
  targetProviders: {
    // "openai:gpt-4.1-mini" -> { model: "gpt-4.1-mini" } merged into the body
    openai: (id) => ({ payload: { model: id } }),
  },
});
```

The dispatch body becomes `{ messages, model: "gpt-4.1-mini" }`. Read it in the
route and **allowlist** it. Never pass a client-supplied model straight to the
provider:

```ts
// app/api/ai-sdk/dispatch/route.ts
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createPersonaSSEStream, personaMessagesToModelMessages } from "../../../lib/persona-wire";

export const runtime = "nodejs";

const ALLOWED = new Set(["gpt-4.1-mini", "gpt-4.1"]);

export async function POST(req: Request) {
  const body = await req.json();
  const modelId = ALLOWED.has(body.model) ? body.model : "gpt-4.1-mini";

  return createPersonaSSEStream(async ({ emit }) => {
    const result = streamText({
      model: openai(modelId),
      messages: personaMessagesToModelMessages(body.messages),
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") emit.textDelta(part.text);
      else if (part.type === "error") {
        emit.error(part.error instanceof Error ? part.error.message : String(part.error));
        return;
      }
    }
    emit.complete();
  });
}
```

This route reads `req.json()` directly instead of using `createAISDKPersonaHandler()`,
because that helper takes a fixed `model`. For per-request selection, inline the
handler as above (or extend the helper to accept `model: (body) => LanguageModel`).

Notes:

- **OpenAI SDK** is the same shape: read `body.model` and pass it to
  `responses.create({ model, ... })`. To target a saved OpenAI assistant instead
  of a model, resolve to `{ payload: { assistantId: id } }` and read
  `body.assistantId` in the route.
- **Runtype TypeIDs** route automatically: `target: "agent_…"` / `"flow_…"` need
  no resolver (the prefix is self-describing).
- `target` is mutually exclusive with `agentId`, `flowId`, and inline `agent`.
- See `packages/widget/docs/CONFIGURATION-REFERENCE.md` ("Routing targets") for
  the full resolution rules.

## What this intentionally does not show

This example is streaming chat plus one fire-and-forget tool call. It does not
include WebMCP, browser-executed tools, the `await` pause, or `/resume`. Those
belong in the advanced example at `examples/ai-sdk-webmcp`.

The split is deliberate:

- Start here to understand the base stream adapter contract.
- Move to `examples/ai-sdk-webmcp` when you need browser-executed page tools and
  pause/resume semantics.


## Preview V5 tool activity

When creating the Persona widget, opt into the new defaults:

```ts
const widget = createAgentExperience(mount, {
  apiUrl: "/api/ai-sdk/dispatch",
  future: { v5Defaults: true },
});
```

Use the API URL of your chosen adapter route. V5 groups consecutive tool calls
and keeps their details collapsed while streaming. Open a call to see Request
and Response blocks; tools without arguments show only Response. Streamed output
is replaced by the final result. Hover a block or focus it with the keyboard to
reveal its copy icon; a check confirms copying. Touch devices show the icon
without hovering. Errors remain visible in the expanded call.

To opt into automatic opening, set
`features: { toolCallDisplay: { autoExpand: true } }`. Omit the V5 flag to retain
V4 presentation. See the [theme guide](../../packages/widget/THEME-CONFIG.md#v5-tool-details)
for color overrides and rendering behavior.

Group labels use Persona's built-in summaries, including counts such as
“Web searches (2)” for repeated searches and “3 activities” for completed mixed
groups. No custom group-summary hook is enabled in the demo.

### Optional descriptive group labels

[tool-activity-summary.ts](app/lib/tool-activity-summary.ts) is a reusable,
frontend-only recipe using the existing `toolCall.renderGroupedSummary` hook.
It is not enabled in this demo by default and introduces no new Persona API.
Import it in your widget component:

```ts
import { renderToolActivitySummary } from "../lib/tool-activity-summary";

const widget = createAgentExperience(mount, {
  apiUrl: "/api/ai-sdk/dispatch",
  future: { v5Defaults: true },
  toolCall: { renderGroupedSummary: renderToolActivitySummary },
});
```

Edit the helper's `categories` map to match your backend's exact tool names.
For example, `read_file` and `read_document` both map to `read`; repeated calls
produce one “Read files” label. A read followed by a command displays
“Read files, Ran commands.” Categories retain their first appearance order.
Each category uses its running label while any call in it is pending or running.

Unknown tools, failures, and approval attention states return `null`, so Persona
uses its built-in summary for the entire group. This deliberately avoids
presenting a partial list that hides unmapped calls. Individual tool details
and disclosure behavior are unchanged.

Built-in example labels are count-neutral. To customize wording or plurals,
replace a label with a function, for example:

```ts
command: {
  running: "Running commands",
  complete: count => count === 1 ? "Ran one command" : `Ran ${count} commands`,
},
```

`count` means tool invocations, not files or search results. Only use object
counts when your tools guarantee that relationship. For localization, translate
both states and replace the final `.join(", ")` with your preferred list
formatter (for example, `Intl.ListFormat`). Metadata need not cross the backend
boundary: the recipe works with any adapter that supplies stable tool names.
