import {
  createPersonaSSEStream,
  personaMessagesToChat,
  type ChatMessage,
  type PersonaDispatchBody,
} from "./persona-wire";

/**
 * The canonical "agent" for the host-matrix examples, deliberately
 * host-agnostic.
 *
 * `createEchoPersonaHandler` returns a standard Web handler, `(Request) =>
 * Promise<Response>`. Every host in the matrix (Hono, Express, SvelteKit, bare
 * Node) mounts THIS exact function; only the thin host wrapper around it
 * changes. `persona-wire.ts` and this file are byte-identical across all four.
 * Diff the examples and the wire never moves.
 *
 * By default it streams a zero-dependency echo, so the example runs with no API
 * key and no network. Pass your own `respond` to stream a real model instead.
 * See `openAiResponder` below, a dependency-free responder built on raw `fetch`.
 */

/** Streams assistant text for one turn, given the conversation so far. */
export type Responder = (messages: ChatMessage[]) => AsyncIterable<string>;

export function createEchoPersonaHandler(options: { respond?: Responder } = {}) {
  const respond = options.respond ?? echoResponder;

  return async function handle(req: Request): Promise<Response> {
    const body = (await req.json()) as PersonaDispatchBody;
    const messages = personaMessagesToChat(body.messages);

    return createPersonaSSEStream(async ({ emit }) => {
      for await (const chunk of respond(messages)) emit.textDelta(chunk);
      emit.complete();
    });
  };
}

/** Default agent: echoes the last user message back, streamed word by word. */
async function* echoResponder(messages: ChatMessage[]): AsyncIterable<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const reply = lastUser
    ? `You said: "${lastUser.content}". This is the zero-dependency echo agent. ` +
      "swap in a real model by passing your own `respond`."
    : "Send a message and the echo agent will stream it back.";

  for (const word of reply.split(" ")) yield word + " ";
}

/**
 * Optional real model, still zero dependencies: streams an OpenAI-compatible
 * chat completion over raw `fetch` (no SDK). Wire it up with:
 *
 *   createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })
 */
export function openAiResponder(apiKey: string, model = "gpt-4o-mini"): Responder {
  return async function* (messages) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, stream: true, messages }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`OpenAI request failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice("data:".length).trim();
        if (data === "[DONE]") return;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) yield delta as string;
        } catch {
          // Ignore keep-alive lines and partial JSON between chunks.
        }
      }
    }
  };
}
