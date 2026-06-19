// ───────────────────────────────────────────────────────────────────────────
// Persona's SSE wire protocol, implemented on top of the Vercel
// AI SDK.
//
// The Persona widget POSTs a dispatch request, reads an SSE stream, and, for
// WebMCP page tools, pauses on an `await` event, runs the tool on the page, and
// POSTs the result to `${apiUrl}/resume`. This is the one protocol any backend
// can speak — the same wire the Runtype API emits. The widget consumes the
// wire natively; it is otherwise unchanged and never learns it isn't
// talking to a hosted agent runtime.
//
// Wire contract (verified against packages/widget/src/client.ts, the native handler):
//   • run start   → event: execution_start  {type, executionId, kind:"agent",
//                                            agentId, startedAt}
//   • turn open   → event: turn_start        {type, executionId, id:"turn_…",
//                                            iteration}
//   • text delta  → event: text_start/_delta/_complete
//                                            {type, executionId, id:"text_…",
//                                            delta, iteration}
//   • WebMCP call → event: await             {type, executionId, toolName:"<bare>",
//                                            origin:"webmcp", toolId, toolCallId,
//                                            parameters, awaitedAt}
//   • turn done   → event: turn_complete + execution_complete
//                                            {type, executionId, kind:"agent",
//                                            success:true, completedAt}
//   • failure     → event: execution_error   {type, executionId, kind:"agent",
//                                            error:{message}}
// Resume body: {executionId, toolOutputs: Record<toolCallId, WebMcpToolResult>}.
//
// Three correctness properties this reference models on purpose (an external
// adapter owns its own ids, so it gets them right by construction):
//   1. ONE `exec_…` executionId is carried across the whole run — every delta,
//      every `await`, every resume, and `execution_complete`.
//   2. `iteration` ADVANCES on each /resume: re-invoking the model over the tool
//      results is a new reasoning turn, so the resumed turn reports iteration+1.
//   3. `kind:"agent"` is announced on `execution_start` and is HONEST: this
//      backend is a real agent. A /resume continuation has no `execution_start`
//      to re-announce kind, but the widget bridge defaults a fresh stream to
//      kind:"agent" — which matches. A backend that wrapped an agent in a
//      virtual flow (kind:"flow") would mis-route resume tool events unless it
//      re-announced kind; this one sidesteps that by not lying about what it is.
// ───────────────────────────────────────────────────────────────────────────

import {
  generateId,
  jsonSchema,
  streamText,
  tool,
  type ModelMessage,
  type ToolCallPart,
  type ToolResultPart,
  type ToolSet,
} from "ai";
import {
  deletePausedExecution,
  loadPausedExecution,
  savePausedExecution,
} from "./execution-store";

// Server-applied wire prefix the widget uses to route a call to its WebMCP
// bridge (isWebMcpToolName checks `startsWith("webmcp:")`). Hard-coded here so
// the server stays independent of the browser widget bundle.
const WEBMCP_PREFIX = "webmcp:";

// Bare "creator/model" id → the AI SDK routes through the Vercel AI Gateway
// (the default provider when no provider instance is given). On Vercel this
// authenticates automatically via OIDC; locally it uses AI_GATEWAY_API_KEY.
const MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

const SYSTEM_PROMPT = `You are the Switchback shopping assistant for a trail & road running store.
You help shoppers using ONLY the page's own tools (search_products, view_product,
add_to_cart, remove_from_cart, apply_promo). Always call search_products to get
valid SKUs before adding to the cart. After a cart change, confirm the running
total from the tool result. When the shopper asks for several actions at once
(e.g. "add SHOE-001 and SHOE-007"), emit the tool calls together in one turn.
Tool results include product imageUrl/imageAlt. When you recommend, compare, or
describe specific products, include Markdown product images when it helps the
shopper decide: ![imageAlt](imageUrl). Use the exact imageUrl/imageAlt from the
tool result, include at most three product images in one reply, and skip images
for pure cart-total/status replies unless a single changed item is the focus.
Be concise and friendly.`;

// ── Widget request payloads ────────────────────────────────────────────────

export interface ClientToolDefinition {
  name: string;
  description: string;
  parametersSchema?: Record<string, unknown>;
  origin?: string;
}

interface DispatchBody {
  messages?: Array<{ role: string; content: unknown }>;
  clientTools?: ClientToolDefinition[];
}

interface ResumeBody {
  executionId?: string;
  toolOutputs?: Record<string, unknown>;
}

interface WebMcpToolResult {
  content?: Array<{ type?: string; text?: string } & Record<string, unknown>>;
  isError?: boolean;
}

// Paused conversations live in `execution-store.ts` (Vercel Runtime Cache, so
// the dispatch pause and the later /resume can land on different serverless
// instances). The widget's /resume request omits clientTools[], so we persist
// the full tool surface there too: multi-step prompts call other tools after
// the first result returns. ⚠️ That store is an ephemeral cache: swap it for a
// durable data store in production (see execution-store.ts).

// ── SSE plumbing ────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

export interface SSESender {
  send(event: string, payload: Record<string, unknown>): void;
}

/** Build a streaming SSE Response and run `handler` against a writer. */
export function sseResponse(
  handler: (send: SSESender) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SSESender = {
        send(event, payload) {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify({ type: event, ...payload })}\n\n`,
            ),
          );
        },
      };
      try {
        await handler(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Terminal failure of the handler → `execution_error` (the bridge
        // maps it to a non-recoverable agent_error). Unified `error` is the
        // NON-terminal one, so it's the wrong frame for an uncaught throw.
        send.send("execution_error", { kind: "agent", error: { message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map widget messages → AI SDK ModelMessages (the storefront is text-only). */
function toModelMessages(
  messages: Array<{ role: string; content: unknown }> = [],
): ModelMessage[] {
  return messages
    .map((m): ModelMessage | null => {
      const text = flattenContent(m.content);
      if (m.role === "assistant") return { role: "assistant", content: text };
      if (m.role === "system") return { role: "system", content: text };
      return { role: "user", content: text };
    })
    .filter((m): m is ModelMessage => m !== null);
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("");
  }
  return "";
}

/** Build a no-execute ToolSet from the widget's clientTools[] (client-side). */
function buildTools(clientTools: ClientToolDefinition[] = []): ToolSet {
  const set: ToolSet = {};
  for (const t of clientTools) {
    set[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema((t.parametersSchema as object) ?? { type: "object" }),
      // No `execute`: the model's call streams out and the turn pauses; the
      // widget runs the tool on the page and returns the result via /resume.
    });
  }
  return set;
}

/** Flatten a WebMcpToolResult to text for the model. */
function resultToOutput(raw: unknown): ToolResultPart["output"] {
  const result = raw as WebMcpToolResult | string | undefined;
  if (typeof result === "string") return { type: "text", value: result };
  const text =
    result?.content
      ?.map((c) => (c?.type === "text" ? (c.text ?? "") : JSON.stringify(c)))
      .join("\n") ?? JSON.stringify(result ?? null);
  return result?.isError
    ? { type: "error-text", value: text }
    : { type: "text", value: text };
}

// ── Core turn: stream text, surface tool calls, pause or complete ───────────

/**
 * Run one model turn over `messages`, streaming text as `text_delta`. If
 * the model calls page tools, emit an `await` per call and PAUSE (store state,
 * no `turn_complete`/`execution_complete`). Otherwise finalize the turn and run.
 *
 * `iteration` is the 1-based turn index within this run; it advances on each
 * /resume (see handleResume) so the wire reflects a genuinely new reasoning turn.
 */
async function runTurn(
  send: SSESender,
  executionId: string,
  messages: ModelMessage[],
  clientTools: ClientToolDefinition[],
  iteration: number,
): Promise<void> {
  const turnId = `turn_${generateId()}`;
  let text = "";
  let textBlockId: string | null = null;
  const toolCalls: ToolCallPart[] = [];

  // turn_start opens this iteration's reasoning turn; the text block opens
  // lazily on the first delta so a tool-only turn never emits a stray text_start.
  send.send("turn_start", { executionId, id: turnId, iteration });

  const result = streamText({
    model: MODEL, // string id → Vercel AI Gateway (see MODEL above)
    system: SYSTEM_PROMPT,
    messages,
    tools: buildTools(clientTools),
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      if (textBlockId === null) {
        textBlockId = `text_${generateId()}`;
        send.send("text_start", { executionId, id: textBlockId });
      }
      send.send("text_delta", { executionId, id: textBlockId, delta: part.text, iteration });
    } else if (part.type === "tool-call") {
      toolCalls.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      });
      // `await` carries a BARE tool name + origin; the widget bridge applies the
      // `webmcp:` prefix, maps it onto the local-tool `step_await` path, and keys
      // the pause by toolCallId (parallel same-tool calls stay distinct).
      send.send("await", {
        executionId,
        toolId: `runtime_${WEBMCP_PREFIX}${part.toolName}_${part.toolCallId}`,
        toolName: part.toolName,
        origin: "webmcp",
        toolCallId: part.toolCallId,
        parameters: part.input,
        awaitedAt: new Date().toISOString(),
      });
    } else if (part.type === "error") {
      const message =
        part.error instanceof Error ? part.error.message : String(part.error);
      send.send("execution_error", { executionId, kind: "agent", error: { message } });
      return;
    }
  }

  // Close the text block once, if one opened, before pausing or completing.
  if (textBlockId !== null) {
    send.send("text_complete", { executionId, id: textBlockId });
  }

  if (toolCalls.length > 0) {
    // Pause: persist the assistant turn (incl. tool calls), the pending set, and
    // the current iteration so the resumed turn can report iteration + 1.
    const assistantContent: Array<{ type: "text"; text: string } | ToolCallPart> = [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...toolCalls,
    ];
    await savePausedExecution(executionId, {
      messages: [...messages, { role: "assistant", content: assistantContent }],
      pending: toolCalls.map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
      })),
      clientTools,
      iteration,
    });
    return; // no turn_complete/execution_complete: the widget /resumes with outputs
  }

  // No tool calls: the turn is done. Clean up the stored execution now that it
  // has completed (a no-op on the initial dispatch path). We deliberately did
  // NOT delete earlier in handleResume: if the turn errors mid-stream, the
  // paused state must stay put so the widget can retry /resume with the same
  // executionId instead of getting an "unknown executionId" error.
  try {
    await deletePausedExecution(executionId);
  } catch {
    /* best-effort cleanup; the cache TTL expires it regardless */
  }
  const completedAt = new Date().toISOString();
  send.send("turn_complete", {
    executionId,
    id: turnId,
    iteration,
    stopReason: "end_turn",
    completedAt,
  });
  send.send("execution_complete", {
    executionId,
    kind: "agent",
    success: true,
    completedAt,
  });
}

// ── Route entry points ───────────────────────────────────────────────────────

export function handleDispatch(body: DispatchBody): Response {
  const messages = toModelMessages(body.messages);
  const clientTools = body.clientTools ?? [];
  const executionId = `exec_${generateId()}`;
  return sseResponse((send) => {
    send.send("execution_start", {
      executionId,
      kind: "agent",
      agentId: "virtual",
      agentName: "Switchback Assistant",
      startedAt: new Date().toISOString(),
    });
    return runTurn(send, executionId, messages, clientTools, 1);
  });
}

export function handleResume(body: ResumeBody): Response {
  const executionId = body.executionId ?? "";

  return sseResponse(async (send) => {
    const paused = await loadPausedExecution(executionId);
    if (!paused) {
      send.send("error", {
        message: `Unknown executionId "${executionId}" (expired or evicted from the cache: see execution-store.ts).`,
      });
      return;
    }
    // NB: we do NOT delete the paused state here: runTurn cleans it up only
    // once the continued turn completes, so a mid-stream failure stays retryable.

    const outputs = body.toolOutputs ?? {};
    const toolResults: ToolResultPart[] = paused.pending.map((p) => {
      // The widget's batched /resume may omit a call (aborted, deduped, or its
      // execute() failed), so its output key is absent. Anthropic still requires
      // a tool_result for every tool_use, so emit an explicit error result for
      // the missing one rather than a "null" placeholder (which would read as a
      // real, empty result). The model can then react / re-request as needed.
      const has = p.toolCallId in outputs || p.toolName in outputs;
      return {
        type: "tool-result",
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        output: has
          ? resultToOutput(outputs[p.toolCallId] ?? outputs[p.toolName])
          : {
              type: "error-text",
              value:
                "No output was returned for this tool call (it was cancelled or failed on the page).",
            },
      };
    });

    const messages: ModelMessage[] = [
      ...paused.messages,
      { role: "tool", content: toolResults },
    ];

    // Reuse the same executionId so a follow-up tool call can /resume again, and
    // advance the iteration: re-invoking the model over the tool results is a new
    // reasoning turn. No fresh execution_start — this continues the run, not a
    // new one (a bare turn_start, which the widget renders under the kind:"agent"
    // it already resolved on dispatch).
    await runTurn(send, executionId, messages, paused.clientTools, paused.iteration + 1);
  });
}
