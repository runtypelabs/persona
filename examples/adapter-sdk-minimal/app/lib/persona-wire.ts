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

type PersonaFrame = {
  type: string;
  executionId: string;
  agentId?: string;
  startedAt?: string;
  completedAt?: string;
  iteration?: number;
  turnId?: string;
  contentType?: "text";
  delta?: string;
  success?: boolean;
  recoverable?: boolean;
  error?: { message: string };
};

export type PersonaStreamEmitter = {
  /** Stream a chunk of assistant text (agent_turn_delta, contentType: "text"). */
  textDelta(text: string): void;
  /** Finalize the turn successfully (agent_complete). */
  complete(): void;
  /** Abort the turn with an error (agent_error). */
  error(message: string): void;
};

export type PersonaStreamContext = {
  emit: PersonaStreamEmitter;
  executionId: string;
  turnId: string;
};

const encoder = new TextEncoder();

/**
 * Wrap a streaming handler in Persona's **agent** SSE vocabulary.
 *
 * This is the neutral protocol any backend can speak — not Runtype's flow
 * dialect (`step_*` / `flow_complete`). One agent turn looks like:
 *
 *   event: agent_start        { executionId, agentId, startedAt }
 *   event: agent_turn_delta   { executionId, iteration, turnId, contentType:"text", delta }
 *   …more deltas…
 *   event: agent_complete     { executionId, success:true, completedAt }
 *
 * The streamed deltas are authoritative — unlike the flow vocabulary there is
 * no need to re-send the full text at the end. A single `executionId`
 * (`exec_…`) is carried across every event of the run.
 */
export function createPersonaSSEStream(
  handler: (context: PersonaStreamContext) => Promise<void> | void,
): Response {
  const executionId = `exec_${crypto.randomUUID()}`;
  const turnId = `turn_${crypto.randomUUID()}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: Omit<PersonaFrame, "type" | "executionId">) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify({ type: event, executionId, ...payload })}\n\n`,
          ),
        );
      };

      const emit: PersonaStreamEmitter = {
        textDelta(text) {
          send("agent_turn_delta", { iteration: 1, turnId, contentType: "text", delta: text });
        },
        complete() {
          send("agent_complete", { success: true, completedAt: new Date().toISOString() });
        },
        error(message) {
          send("agent_error", { recoverable: false, error: { message } });
        },
      };

      // agent_start opens the run; agent_turn_delta + agent_complete come from the handler.
      send("agent_start", { agentId: "virtual", startedAt: new Date().toISOString() });

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
