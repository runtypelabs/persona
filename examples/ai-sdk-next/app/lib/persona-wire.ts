import type { ModelMessage } from "ai";

export type PersonaRequestMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
  createdAt?: string;
  phase?: PersonaTextPhase;
  agentMetadata?: { phase?: PersonaTextPhase; providerPhase?: PersonaTextPhase };
};

export type PersonaDispatchBody = {
  messages?: PersonaRequestMessage[];
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type PersonaTextPhase = "commentary" | "partial_answer" | "final_answer";

/** The event-specific payloads this standalone adapter emits. */
type WirePayloads = {
  execution_start: { kind: "agent"; agentId: string; agentName: string; startedAt: string };
  turn_start: { id: string; role: "assistant"; iteration: number };
  reasoning_start: { id: string; scope: "turn" };
  reasoning_delta: { id: string; delta: string };
  reasoning_complete: { id: string };
  text_start: { id: string; phase?: PersonaTextPhase };
  text_delta: { id: string; delta: string };
  text_complete: { id: string; phase?: PersonaTextPhase };
  tool_start: { toolCallId: string; toolName: string; toolType: string; parameters: unknown; iteration: number };
  tool_complete: { toolCallId: string; success: boolean; result: unknown };
  turn_complete: { id: string; role: "assistant"; iteration: number; stopReason: "end_turn"; completedAt: string };
  execution_complete: { kind: "agent"; success: boolean; completedAt: string };
  execution_error: { kind: "agent"; error: { code: string; message: string } };
};

/** The item shape `suggestReplies` accepts; a bare string is shorthand for `{ label }`. */
export type PersonaSuggestion = string | { label: string; prompt?: string; description?: string };

export type PersonaStreamEmitter = {
  reasoningStart(id: string): void;
  reasoningDelta(id: string, text: string): void;
  reasoningComplete(id: string): void;
  /** Stream a chunk of assistant text (`text_delta`). */
  textDelta(text: string, options?: { id?: string; phase?: PersonaTextPhase }): void;
  /** Close one provider content part without completing the assistant turn. */
  textComplete(id: string, options?: { phase?: PersonaTextPhase }): void;
  /** Begin a server-executed tool; complete it only after the provider confirms its result. */
  toolStart(name: string, parameters: unknown, options: { toolCallId: string; toolType?: string }): void;
  toolComplete(toolCallId: string, result: unknown, success?: boolean): void;
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
  /** Aborted when the incoming request or the response reader is cancelled. */
  signal: AbortSignal;
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
 *   event: turn_start        { executionId, id:"turn_…", role:"assistant", iteration:1 }
 *   event: text_start        { executionId, id:"text_…" }
 *   event: text_delta        { executionId, id:"text_…", delta }
 *   …more deltas…
 *   event: text_complete     { executionId, id:"text_…" }
 *   event: tool_start        { executionId, toolCallId:"call_…", toolName, toolType, parameters }
 *   event: tool_complete     { executionId, toolCallId:"call_…", success:true, result }
 *   event: turn_complete     { executionId, id:"turn_…", role:"assistant", iteration:1, stopReason, completedAt }
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
  options: { signal?: AbortSignal } = {},
): Response {
  const executionId = `exec_${crypto.randomUUID()}`;
  const turnId = `turn_${crypto.randomUUID()}`;

  const abortController = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, abortController.signal])
    : abortController.signal;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // `seq` is the wire envelope's monotonic sequence number. The widget
      // reads a single in-order connection so it isn't load-bearing here, but a
      // faithful reference emits it.
      let seq = 0;
      const send = <T extends keyof WirePayloads>(event: T, payload: WirePayloads[T]) => {
        if (cancelled) return;
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify({ type: event, executionId, seq: seq++, ...payload })}\n\n`,
          ),
        );
      };

      // One turn, lazily opened. The text block opens on the first delta so an
      // empty turn never emits a stray `text_start`.
      let turnOpen = false;
      const textBlocks = new Set<string>();
      let defaultTextBlockId: string | null = null;
      let finished = false;

      const openTurn = () => {
        if (!turnOpen) {
          send("turn_start", { id: turnId, role: "assistant", iteration: 1 });
          turnOpen = true;
        }
      };
      const closeTextBlock = (id: string, phase?: PersonaTextPhase) => {
        if (textBlocks.delete(id)) send("text_complete", { id, ...(phase ? { phase } : {}) });
        if (defaultTextBlockId === id) defaultTextBlockId = null;
      };
      const closeTextBlocks = () => {
        for (const id of textBlocks) closeTextBlock(id);
      };

      const emit: PersonaStreamEmitter = {
        reasoningStart(id) { if (!finished) { openTurn(); send("reasoning_start", { id, scope: "turn" }); } },
        reasoningDelta(id, delta) { if (!finished) send("reasoning_delta", { id, delta }); },
        reasoningComplete(id) { if (!finished) send("reasoning_complete", { id }); },
        textDelta(text, options) {
          if (finished || !text) return;
          openTurn();
          const id = options?.id ?? defaultTextBlockId ?? `text_${crypto.randomUUID()}`;
          if (!options?.id) defaultTextBlockId = id;
          if (!textBlocks.has(id)) {
            textBlocks.add(id);
            send("text_start", { id, ...(options?.phase ? { phase: options.phase } : {}) });
          }
          send("text_delta", { id, delta: text });
        },
        textComplete(id, options) {
          if (!finished) closeTextBlock(id, options?.phase);
        },
        toolStart(name, parameters, options) {
          if (finished) return;
          closeTextBlocks();
          openTurn();
          send("tool_start", {
            toolCallId: options.toolCallId,
            toolName: name,
            toolType: options.toolType ?? "local",
            parameters,
            iteration: 1,
          });
        },
        toolComplete(toolCallId, result, success = true) {
          if (!finished) send("tool_complete", { toolCallId, success, result });
        },
        toolCall(name, parameters, options) {
          const toolCallId = options?.toolCallId ?? `call_${crypto.randomUUID()}`;
          emit.toolStart(name, parameters, { toolCallId, toolType: options?.toolType });
          emit.toolComplete(toolCallId, options?.result ?? {});
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
          closeTextBlocks();
          if (turnOpen) {
            send("turn_complete", {
              id: turnId,
              role: "assistant",
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
          send("execution_error", { kind: "agent", error: { code: "adapter_error", message } });
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
        signal.throwIfAborted();
        await handler({ emit, executionId, turnId, signal });
      } catch (error) {
        emit.error(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel(reason) {
      cancelled = true;
      abortController.abort(reason);
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
    .map((message) => {
      const phase = message.phase ?? message.agentMetadata?.providerPhase ?? message.agentMetadata?.phase;
      return {
        role: message.role,
        content: flattenContent(message.content),
        // OpenAI accepts these two phases on assistant history. Never manufacture
        // a final phase for unlabelled messages or send phase on user messages.
        ...(message.role === "assistant" && (phase === "commentary" || phase === "final_answer")
          ? { phase }
          : {}),
      };
    });
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
