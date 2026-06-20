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
 * In production it defaults to connecting to the eve agent via the `eve/client` SDK.
 *
 * Host resolution (live path): an explicit `host` option wins, then `EVE_BASE_URL`
 * (point at an already-running eve server), then the request's own origin. The
 * origin fallback is what makes `withEve()` "just work": eve launches alongside
 * `next dev` and same-origin `/eve/v1/...` requests are proxied to it, so the
 * route reaches the agent without any env var.
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
  /** Origin of the inbound request; used as the same-origin eve base URL. */
  origin?: string;
}) => AsyncIterable<EveSessionEvent> | Promise<AsyncIterable<EveSessionEvent>>;

type CreateEvePersonaHandlerOptions = {
  getMessages: (body: unknown) => ChatMessage[];
  /** Injectable. Defaults to an `eve/client` session resolved per request. */
  session?: EveSessionStream;
  /** Pin a specific eve base URL, overriding EVE_BASE_URL and the request origin. */
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
    const origin = originOf(req);

    return createPersonaSSEStream(async ({ emit }) => {
      const events = await sessionStream({ prompt, origin });

      for await (const event of events) {
        if (event.type === "message.appended" && event.data?.messageDelta) {
          emit.textDelta(event.data.messageDelta);
        }
      }

      emit.complete();
    });
  };
}

function defaultSession(host?: string): EveSessionStream {
  return async ({ prompt, origin }) => {
    // Explicit option > EVE_BASE_URL (external eve) > request origin (the
    // withEve same-origin rewrite) > loopback default.
    const baseUrl = host ?? process.env.EVE_BASE_URL ?? origin ?? "http://127.0.0.1:3000";
    // Variable specifier keeps the heavy `eve/client` import off the validation
    // path; the package is only loaded on the live path, never during testing.
    const specifier = "eve/client";
    const mod: any = await import(specifier);
    const client = new mod.Client({ host: baseUrl });
    return client.session().send(prompt) as AsyncIterable<EveSessionEvent>;
  };
}

function originOf(req: Request): string | undefined {
  try {
    return new URL(req.url).origin;
  } catch {
    return undefined;
  }
}

/** Render the conversation as a single prompt; eve manages its own session state. */
function toPrompt(messages: ChatMessage[]): string {
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length <= 1) return turns[0]?.content ?? "";
  return turns
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n\n");
}
