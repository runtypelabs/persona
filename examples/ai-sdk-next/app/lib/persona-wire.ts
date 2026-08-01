import type { ModelMessage } from "ai";

export type PersonaRequestMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
  createdAt?: string;
};

export type PersonaDispatchBody = {
  messages?: PersonaRequestMessage[];
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type WireFrame = {
  type: string;
  executionId: string;
  seq: number;
  // lifecycle (execution_start / execution_complete / execution_error)
  kind?: "agent" | "flow";
  agentId?: string;
  agentName?: string;
  startedAt?: string;
  completedAt?: string;
  success?: boolean;
  stopReason?: string;
  error?: { message: string };
  // turn / block (turn_start, text_start/_delta/_complete, turn_complete)
  id?: string;
  iteration?: number;
  delta?: string;
  // tool (tool_start, tool_complete)
  toolCallId?: string;
  toolName?: string;
  toolType?: string;
  parameters?: unknown;
  result?: unknown;
};

/** The item shape `suggestReplies` accepts; a bare string is shorthand for `{ label }`. */
export type PersonaSuggestion = string | { label: string; prompt?: string; description?: string };

export type PersonaStreamEmitter = {
  /** Stream a chunk of assistant text (`text_delta`). */
  textDelta(text: string): void;
  /**
   * Emit a completed tool call (`tool_start` → `tool_complete`), fire-and-forget:
   * the widget renders the call and the run continues without pausing.
   *
   * Arguments must ride `tool_start.parameters`, which this does by construction.
   * No `origin` field is ever emitted. The widget reads `origin` on `await`
   * frames only, where `origin: "webmcp"` renames the tool to `webmcp:<name>`
   * and routes it to the page-tool bridge; omitting it is safe on every frame.
   *
   * There is deliberately no `await`/resume support here. A real pause needs a
   * `POST ${apiUrl}/resume` endpoint and server-side state; see
   * `examples/ai-sdk-webmcp` for that pattern.
   */
  toolCall(
    name: string,
    parameters: unknown,
    options?: { toolCallId?: string; toolType?: string; result?: unknown },
  ): void;
  /**
   * Offer 1-4 tappable quick replies via the built-in `suggest_replies` tool.
   *
   * Call it after the final `textDelta` and before `complete()`: the chips stay
   * disabled until the stream terminates. Max 4 items; the widget drops extras
   * with a console warning.
   */
  suggestReplies(items: PersonaSuggestion[]): void;
  /** Finalize the turn successfully (`text_complete` → `turn_complete` → `execution_complete`). */
  complete(): void;
  /** Abort the run with a terminal error (`execution_error`). */
  error(message: string): void;
};

export type PersonaStreamContext = {
  emit: PersonaStreamEmitter;
  executionId: string;
  turnId: string;
};

const encoder = new TextEncoder();

/**
 * Wrap a streaming handler in Persona's SSE event vocabulary.
 *
 * Any backend can speak this protocol, and it matches the exact same wire the
 * Runtype API emits. The widget consumes the wire natively. One
 * agent turn looks like:
 *
 *   event: execution_start   { executionId, kind:"agent", agentId, startedAt }
 *   event: turn_start        { executionId, id:"turn_…", iteration:1 }
 *   event: text_start        { executionId, id:"text_…" }
 *   event: text_delta        { executionId, id:"text_…", delta, iteration:1 }
 *   …more deltas…
 *   event: text_complete     { executionId, id:"text_…" }
 *   event: tool_start        { executionId, toolCallId:"call_…", toolName, toolType, parameters }
 *   event: tool_complete     { executionId, toolCallId:"call_…", success:true, result }
 *   event: turn_complete     { executionId, id:"turn_…", iteration:1, stopReason, completedAt }
 *   event: execution_complete{ executionId, kind:"agent", success:true, completedAt }
 *
 * The tool frames are optional; a text-only turn simply omits them. They are
 * what `emit.toolCall` and `emit.suggestReplies` put on the wire.
 *
 * The streamed deltas are authoritative. You don't need to re-send the full
 * text at the end. One `executionId` (`exec_…`) and `kind:"agent"` are carried
 * across the run. Because this adapter IS a genuine agent (kind:"agent"), a
 * `/resume` continuation (which has no `execution_start` to re-announce the
 * kind) is correct by construction: the widget bridge defaults a fresh stream
 * to kind:"agent", which matches.
 */
export function createPersonaSSEStream(
  handler: (context: PersonaStreamContext) => Promise<void> | void,
): Response {
  const executionId = `exec_${crypto.randomUUID()}`;
  const turnId = `turn_${crypto.randomUUID()}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // `seq` is the wire envelope's monotonic sequence number. The widget
      // reads a single in-order connection so it isn't load-bearing here, but a
      // faithful reference emits it.
      let seq = 0;
      const send = (event: string, payload: Omit<WireFrame, "type" | "executionId" | "seq">) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify({ type: event, executionId, seq: seq++, ...payload })}\n\n`,
          ),
        );
      };

      // One turn, lazily opened. The text block opens on the first delta so an
      // empty turn never emits a stray `text_start`.
      let turnOpen = false;
      let textBlockId: string | null = null;
      let finished = false;

      const openTurn = () => {
        if (!turnOpen) {
          send("turn_start", { id: turnId, iteration: 1 });
          turnOpen = true;
        }
      };
      const openTextBlock = () => {
        openTurn();
        if (textBlockId === null) {
          textBlockId = `text_${crypto.randomUUID()}`;
          send("text_start", { id: textBlockId });
        }
      };
      const closeTextBlock = () => {
        if (textBlockId !== null) {
          send("text_complete", { id: textBlockId });
          textBlockId = null;
        }
      };

      const emit: PersonaStreamEmitter = {
        textDelta(text) {
          openTextBlock();
          send("text_delta", { id: textBlockId!, delta: text, iteration: 1 });
        },
        toolCall(name, parameters, options) {
          // Blocks don't nest: close any open text block first. A later
          // `textDelta` lazily opens a fresh one.
          closeTextBlock();
          openTurn();
          const toolCallId = options?.toolCallId ?? `call_${crypto.randomUUID()}`;
          send("tool_start", {
            toolCallId,
            toolName: name,
            toolType: options?.toolType ?? "local",
            parameters,
            iteration: 1,
          });
          send("tool_complete", {
            toolCallId,
            success: true,
            result: options?.result ?? {},
            completedAt: new Date().toISOString(),
          });
        },
        suggestReplies(items) {
          emit.toolCall(
            "suggest_replies",
            { suggestions: items },
            { result: { content: [{ type: "text", text: "Suggestions shown to the user." }] } },
          );
        },
        complete() {
          if (finished) return;
          finished = true;
          closeTextBlock();
          if (turnOpen) {
            send("turn_complete", {
              id: turnId,
              iteration: 1,
              stopReason: "end_turn",
              completedAt: new Date().toISOString(),
            });
            turnOpen = false;
          }
          send("execution_complete", {
            kind: "agent",
            success: true,
            completedAt: new Date().toISOString(),
          });
        },
        error(message) {
          if (finished) return;
          finished = true;
          send("execution_error", { kind: "agent", error: { message } });
        },
      };

      // execution_start opens the run; the turn/text/complete frames come from
      // the handler via `emit`.
      send("execution_start", {
        kind: "agent",
        agentId: "virtual",
        agentName: "Adapter Agent",
        startedAt: new Date().toISOString(),
      });

      try {
        await handler({ emit, executionId, turnId });
      } catch (error) {
        emit.error(error instanceof Error ? error.message : String(error));
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

export function personaMessagesToModelMessages(
  messages: PersonaRequestMessage[] = [],
): ModelMessage[] {
  return messages
    .filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: flattenContent(message.content),
    }));
}

export function personaMessagesToOpenAIInput(messages: PersonaRequestMessage[] = []) {
  return messages
    .filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: flattenContent(message.content),
    }));
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if ("text" in part) return String(part.text ?? "");
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}
