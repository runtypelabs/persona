import { createPersonaSSEStream, type ChatMessage } from "./persona-wire";

/**
 * Adapter: eve (`eve`, by Vercel) → Persona SSE.
 *
 * eve is a filesystem-first, durable-agent framework that runs its own server.
 * A session streams events; the incremental assistant text arrives on
 * `message.appended` events as `data.messageDelta`. Each becomes a
 * `text_delta`.
 *
 * The session stream is an **injected dependency** (`session`), so tests drive
 * the adapter with a fake event stream, with no running eve server and no model key.
 * In production it defaults to connecting to a local eve dev server via the
 * `eve/client` SDK.
 *
 * Note: eve is beta; the default wiring targets `eve/client`'s
 * `Client().session().send()` event stream and may need tweaks as the API
 * settles. The validation path does not depend on it.
 */

export type EveSessionEvent = {
  type?: string;
  data?: { messageDelta?: string; [key: string]: unknown };
};

export type EveSessionStream = (args: {
  prompt: string;
}) => AsyncIterable<EveSessionEvent> | Promise<AsyncIterable<EveSessionEvent>>;

type CreateEvePersonaHandlerOptions = {
  getMessages: (body: unknown) => ChatMessage[];
  /** Injectable. Defaults to an `eve/client` session against `EVE_HOST`. */
  session?: EveSessionStream;
  host?: string;
};

export function createEvePersonaHandler({
  getMessages,
  session,
  host,
}: CreateEvePersonaHandlerOptions) {
  const sessionStream = session ?? defaultSession(host);

  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const prompt = toPrompt(getMessages(body));

    return createPersonaSSEStream(async ({ emit }) => {
      const events = await sessionStream({ prompt });

      for await (const event of events) {
        if (event.type === "message.appended" && event.data?.messageDelta) {
          emit.textDelta(event.data.messageDelta);
        }
      }

      emit.complete();
    });
  };
}

function defaultSession(host = process.env.EVE_HOST ?? "http://127.0.0.1:3000"): EveSessionStream {
  return async ({ prompt }) => {
    // Variable specifier keeps `tsc` off eve's beta export map; the package is
    // only loaded on the live path, never during validation.
    const specifier = "eve/client";
    const mod: any = await import(specifier);
    const client = new mod.Client({ host });
    return client.session().send(prompt) as AsyncIterable<EveSessionEvent>;
  };
}

/** Render the conversation as a single prompt; eve manages its own session state. */
function toPrompt(messages: ChatMessage[]): string {
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length <= 1) return turns[0]?.content ?? "";
  return turns
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n\n");
}
