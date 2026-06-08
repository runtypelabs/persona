// ───────────────────────────────────────────────────────────────────────────
// Runtype proxy-mode wire protocol, implemented on top of the Vercel AI SDK.
//
// The Persona widget (proxy mode) POSTs a dispatch request, reads an SSE stream,
// and — for WebMCP page tools — pauses on a `step_await` event, runs the tool on
// the page, and POSTs the result to `${apiUrl}/resume`. Runtype normally serves
// that protocol; here we serve it ourselves, backed by `streamText`. The widget
// is unchanged and never learns it isn't talking to Runtype.
//
// Wire contract (verified against packages/widget/src/{client,session}.ts):
//   • text delta  → event: step_chunk    {type, id, executionId, text}
//   • text done   → event: step_complete {type, id, result:{response}}
//   • WebMCP call → event: step_await     {type, awaitReason:"local_tool_required",
//                                          toolName:"webmcp:<bare>", toolId,
//                                          toolCallId, executionId, parameters}
//   • turn done   → event: flow_complete  {type, success:true, executionId}
//   • failure     → event: error          {type, message}
// Resume body: {executionId, toolOutputs: Record<toolCallId, WebMcpToolResult>}.
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
// Gateway slugs use dots (claude-sonnet-4.6), unlike the provider SDK (…-4-6).
const MODEL = "anthropic/claude-sonnet-4.6";

const SYSTEM_PROMPT = `You are the Switchback shopping assistant for a trail & road running store.
You help shoppers using ONLY the page's own tools (search_products, view_product,
add_to_cart, remove_from_cart, apply_promo). Always call search_products to get
valid SKUs before adding to the cart. After a cart change, confirm the running
total from the tool result. When the shopper asks for several actions at once
(e.g. "add SHOE-001 and SHOE-007"), emit the tool calls together in one turn.
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
// the full tool surface there too — multi-step prompts call other tools after
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
        send.send("error", { message });
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
 * Run one model turn over `messages`, streaming text as `step_chunk`. If the
 * model calls page tools, emit a `step_await` per call and PAUSE (store state,
 * no `flow_complete`). Otherwise finalize with `step_complete` + `flow_complete`.
 */
async function runTurn(
  send: SSESender,
  executionId: string,
  messages: ModelMessage[],
  clientTools: ClientToolDefinition[],
): Promise<void> {
  const stepId = `step_${generateId()}`;
  let text = "";
  const toolCalls: ToolCallPart[] = [];

  const result = streamText({
    model: MODEL, // string id → Vercel AI Gateway (see MODEL above)
    system: SYSTEM_PROMPT,
    messages,
    tools: buildTools(clientTools),
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      send.send("step_chunk", { id: stepId, executionId, text: part.text });
    } else if (part.type === "tool-call") {
      toolCalls.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      });
      send.send("step_await", {
        awaitReason: "local_tool_required",
        id: stepId,
        toolId: `runtime_${part.toolName}_${part.toolCallId}`,
        toolName: `${WEBMCP_PREFIX}${part.toolName}`,
        toolCallId: part.toolCallId,
        executionId,
        parameters: part.input,
      });
    } else if (part.type === "error") {
      const message =
        part.error instanceof Error ? part.error.message : String(part.error);
      send.send("error", { message });
      return;
    }
  }

  if (toolCalls.length > 0) {
    // Pause: persist the assistant turn (incl. tool calls) and the pending set.
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
    });
    return; // no flow_complete — the widget will /resume with tool outputs
  }

  // No tool calls: the turn is done. Clean up the stored execution now that it
  // has completed (a no-op on the initial dispatch path). We deliberately did
  // NOT delete earlier in handleResume: if the turn errors mid-stream, the
  // paused state must stay put so the widget can retry /resume with the same
  // executionId instead of getting an "unknown executionId" error.
  send.send("step_complete", { id: stepId, result: { response: text } });
  try {
    await deletePausedExecution(executionId);
  } catch {
    /* best-effort cleanup; the cache TTL expires it regardless */
  }
  send.send("flow_complete", { success: true, executionId });
}

// ── Route entry points ───────────────────────────────────────────────────────

export function handleDispatch(body: DispatchBody): Response {
  const messages = toModelMessages(body.messages);
  const clientTools = body.clientTools ?? [];
  const executionId = `exec_${generateId()}`;
  return sseResponse((send) => runTurn(send, executionId, messages, clientTools));
}

export function handleResume(body: ResumeBody): Response {
  const executionId = body.executionId ?? "";

  return sseResponse(async (send) => {
    const paused = await loadPausedExecution(executionId);
    if (!paused) {
      send.send("error", {
        message: `Unknown executionId "${executionId}" (expired or evicted from the cache — see execution-store.ts).`,
      });
      return;
    }
    // NB: we do NOT delete the paused state here — runTurn cleans it up only
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

    // Reuse the same executionId so a follow-up tool call can /resume again.
    await runTurn(send, executionId, messages, paused.clientTools);
  });
}
