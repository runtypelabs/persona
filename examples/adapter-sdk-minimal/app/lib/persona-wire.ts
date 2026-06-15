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
  id?: string;
  executionId?: string;
  text?: string;
  result?: { response: string };
  success?: boolean;
  message?: string;
};

export type PersonaStreamEmitter = {
  stepChunk(text: string): void;
  stepComplete(text: string): void;
  flowComplete(): void;
  error(message: string): void;
};

export type PersonaStreamContext = {
  emit: PersonaStreamEmitter;
  executionId: string;
  stepId: string;
};

const encoder = new TextEncoder();

export function createPersonaSSEStream(
  handler: (context: PersonaStreamContext) => Promise<void> | void,
): Response {
  const executionId = crypto.randomUUID();
  const stepId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: Omit<PersonaFrame, "type"> = {}) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify({ type: event, ...payload })}\n\n`,
          ),
        );
      };

      const emit: PersonaStreamEmitter = {
        stepChunk(text) {
          send("step_chunk", { id: stepId, executionId, text });
        },
        stepComplete(text) {
          send("step_complete", { id: stepId, executionId, result: { response: text } });
        },
        flowComplete() {
          send("flow_complete", { executionId, success: true });
        },
        error(message) {
          send("error", { message });
        },
      };

      try {
        await handler({ emit, executionId, stepId });
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
