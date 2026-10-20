import { createPersonaSSEStream, type ChatMessage } from "./persona-wire";

/** The small part of Eve's event protocol consumed by Persona. */
export type EveActionRequest = {
  kind?: string;
  callId?: string;
  toolName?: string;
  input?: unknown;
};
export type EveSessionEvent = {
  type: string;
  data?: {
    messageDelta?: string;
    reasoningDelta?: string;
    reasoning?: string;
    stepIndex?: number;
    turnId?: string;
    actions?: readonly EveActionRequest[];
    result?: { callId: string; output?: unknown; isError?: boolean };
    status?: string;
    message?: string;
  };
};
export type EveSessionStream = (args: {
  prompt: string;
  origin?: string;
  signal?: AbortSignal;
}) => AsyncIterable<EveSessionEvent> | Promise<AsyncIterable<EveSessionEvent>>;

type CreateEvePersonaHandlerOptions = {
  getMessages: (body: unknown) => ChatMessage[];
  session?: EveSessionStream;
  host?: string;
};

/** Eve owns execution; Persona displays its actual tool and text lifecycle. */
export function createEvePersonaHandler({ getMessages, session, host }: CreateEvePersonaHandlerOptions) {
  const sessionStream = session ?? defaultSession(host);
  return async function POST(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Send a valid JSON message." }, { status: 400 });
    }
    const messages = getMessages(body);
    if (!messages.some((message) => message.role === "user" && message.content.trim())) {
      return Response.json({ error: "A message is required." }, { status: 400 });
    }
    const prompt = toPrompt(messages);
    return createPersonaSSEStream(async ({ emit, signal: streamSignal }) => {
      const signal = AbortSignal.any([req.signal, streamSignal]);
      const events = await sessionStream({ prompt, origin: new URL(req.url).origin, signal });
      const pending = new Set<string>();
      const reasoning = new Map<string, { id: string; text: string }>();
      for await (const event of events) {
        if (signal.aborted) throw new Error("Response stopped.");
        if (event.type === "reasoning.appended" || event.type === "reasoning.completed") {
          const key = `${event.data?.turnId ?? "turn"}:${event.data?.stepIndex ?? 0}`;
          let block = reasoning.get(key);
          if (!block) {
            block = { id: `reasoning_${crypto.randomUUID()}`, text: "" };
            reasoning.set(key, block);
            emit.reasoningStart(block.id);
          }
          if (event.type === "reasoning.appended" && event.data?.reasoningDelta) {
            block.text += event.data.reasoningDelta;
            emit.reasoningDelta(block.id, event.data.reasoningDelta);
          } else if (event.type === "reasoning.completed") {
            // Completion includes the full reasoning; don't repeat prior deltas.
            if (!block.text && event.data?.reasoning) emit.reasoningDelta(block.id, event.data.reasoning);
            emit.reasoningComplete(block.id);
            reasoning.delete(key);
          }
        } else if (event.type === "message.appended" && event.data?.messageDelta) {
          emit.textDelta(event.data.messageDelta);
        } else if (event.type === "actions.requested") {
          for (const action of event.data?.actions ?? []) {
            if (action.kind !== "tool-call" || !action.toolName || !action.callId || pending.has(action.callId)) continue;
            pending.add(action.callId);
            emit.toolStart(action.toolName, action.input ?? {}, action.callId);
          }
        } else if (event.type === "action.result" && event.data?.result) {
          const result = event.data.result;
          if (!pending.delete(result.callId)) continue;
          emit.toolComplete(result.callId, result.output ?? {}, event.data.status === "completed" && !result.isError);
        } else if (event.type === "turn.failed" || event.type === "session.failed") {
          throw new Error(event.data?.message ?? "Eve could not finish this response.");
        } else if (event.type === "turn.cancelled") {
          throw new Error("Response stopped.");
        } else if (event.type === "input.requested") {
          throw new Error("This example does not support interactive Eve approvals.");
        }
      }
      for (const block of reasoning.values()) emit.reasoningComplete(block.id);
      if (pending.size) throw new Error("Eve ended before all tool results arrived.");
      emit.complete();
    });
  };
}

function defaultSession(host?: string): EveSessionStream {
  return async function* ({ prompt, origin, signal }) {
    try {
      // The typed import is lazy: Preview never loads or starts the Eve runtime.
      const { Client } = await import("eve/client");
      const client = new Client({
        host: host ?? process.env.EVE_BASE_URL ?? origin ?? "http://127.0.0.1:3100",
        ...(process.env.EVE_BEARER_TOKEN ? { auth: { bearer: process.env.EVE_BEARER_TOKEN } } : {}),
        redirect: "error",
      });
      // A fresh Eve session receives Persona's full transcript each request. This
      // keeps browser conversations isolated without a server session registry.
      const { response } = await client.sessions.create({ message: prompt, signal });
      const cancel = () => { void response.cancel().catch(() => undefined); };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        for await (const event of response) {
          switch (event.type) {
            case "message.appended":
            case "reasoning.appended":
            case "reasoning.completed":
            case "actions.requested":
              yield event;
              break;
            case "turn.failed":
            case "session.failed":
              yield { type: event.type, data: { message: "Eve could not finish this response. Please try again." } };
              break;
            case "action.result":
              if (event.data.result.kind === "tool-result") yield { type: event.type, data: { status: event.data.status, result: event.data.result } };
              break;
            case "turn.cancelled":
            case "input.requested":
              cancel();
              yield { type: event.type };
              return;
          }
        }
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    } catch {
      throw new Error(signal?.aborted ? "Response stopped." : "Eve could not finish this response. Check the connection and try again.");
    }
  };
}

function toPrompt(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role === "assistant" ? "Assistant" : message.role === "system" ? "Context" : "User"}: ${message.content}`).join("\n\n");
}
