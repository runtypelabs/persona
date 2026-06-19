/**
 * Persona unified-wire helper. Framework-agnostic, zero runtime dependencies.
 *
 * Published as the `@persona-examples/wire` workspace package and imported by
 * every example, so the only per-example file is the adapter that sits on top of
 * it. To use it outside this repo, copy this file into your app (there's no
 * public npm release yet). It depends on nothing.
 *
 * `createPersonaSSEStream` wraps a streaming handler in Persona's neutral
 * **unified** SSE vocabulary: the protocol any backend can speak, and the
 * exact same wire the Runtype API emits when a caller requests `?events=unified`.
 * The widget either auto-detects it from the leading `execution_start` frame or
 * engages it from `events: 'unified'` in the widget config. One agent turn:
 *
 *   event: execution_start   { executionId, kind:"agent", agentId, startedAt }
 *   event: turn_start        { executionId, id:"turn_…", iteration:1 }
 *   event: text_start        { executionId, id:"text_…" }
 *   event: text_delta        { executionId, id:"text_…", delta, iteration:1 }
 *   …more deltas…
 *   event: text_complete     { executionId, id:"text_…" }
 *   event: turn_complete     { executionId, id:"turn_…", iteration:1, stopReason, completedAt }
 *   event: execution_complete{ executionId, kind:"agent", success:true, completedAt }
 *
 * The streamed deltas are authoritative. You don't need to re-send the full
 * text at the end. One `executionId` (`exec_…`) and `kind:"agent"` are carried
 * across the whole run.
 */

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

/** The neutral chat message shape every adapter maps from. */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type UnifiedFrame = {
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
};

export type PersonaStreamEmitter = {
  /** Stream a chunk of assistant text (unified `text_delta`). */
  textDelta(text: string): void;
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

export function createPersonaSSEStream(
  handler: (context: PersonaStreamContext) => Promise<void> | void,
): Response {
  const executionId = `exec_${crypto.randomUUID()}`;
  const turnId = `turn_${crypto.randomUUID()}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // `seq` is the unified envelope's monotonic sequence number. The widget
      // reads a single in-order connection so it isn't load-bearing here, but a
      // faithful reference emits it.
      let seq = 0;
      const send = (
        event: string,
        payload: Omit<UnifiedFrame, "type" | "executionId" | "seq">,
      ) => {
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
        // A handler that returns without finishing still gets a clean close.
        emit.complete();
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

/** Flatten Persona's request messages to the neutral `ChatMessage[]` adapters consume. */
export function personaMessagesToChat(messages: PersonaRequestMessage[] = []): ChatMessage[] {
  return messages
    .filter(
      (message) =>
        message.role === "system" || message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({ role: message.role, content: flattenContent(message.content) }));
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if ("text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}
