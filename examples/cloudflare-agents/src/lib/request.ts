import { z } from "zod";
import { getTicket, type Ticket } from "../shared/tickets";
import { personaMessagesToChat, type ChatMessage } from "./persona-wire";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([
          z.string(),
          z.array(z.object({ type: z.literal("text"), text: z.string() })),
        ]),
      })
    )
    .min(1)
    .max(40),
  context: z.object({ ticketId: z.string(), conversationId: z.uuid() }),
});
export type ValidatedDispatch = {
  messages: ChatMessage[];
  ticket: Ticket;
  conversationId: string;
  mode: "preview" | "live";
};
export async function parseDispatch(
  request: Pick<Request, "method" | "url" | "text">
): Promise<ValidatedDispatch | Response> {
  if (request.method !== "POST")
    return Response.json(
      { error: "Use POST for assistant messages." },
      { status: 405, headers: { allow: "POST" } }
    );
  const mode = new URL(request.url).searchParams.get("mode") ?? "preview";
  if (mode !== "preview" && mode !== "live")
    return Response.json(
      { error: "Choose Preview or Live mode." },
      { status: 400 }
    );
  let body: z.infer<typeof schema>;
  try {
    const raw = await request.text();
    if (raw.length > 128_000)
      return Response.json(
        { error: "The conversation is too large." },
        { status: 413 }
      );
    body = schema.parse(JSON.parse(raw));
  } catch {
    return Response.json(
      { error: "Send messages, a known ticketId, and a UUID conversationId." },
      { status: 400 }
    );
  }
  const ticket = getTicket(body.context.ticketId);
  if (!ticket)
    return Response.json({ error: "Ticket not found." }, { status: 404 });
  // The application owns the system prompt. Browser history contributes only user/assistant messages.
  const messages = personaMessagesToChat(body.messages).filter(
    (message) => message.role !== "system"
  );
  if (
    !messages.length ||
    messages.at(-1)?.role !== "user" ||
    !messages.at(-1)?.content.trim() ||
    messages.some((message) => message.content.length > 16_000)
  )
    return Response.json(
      {
        error:
          "End the conversation with a user message of 1–16,000 characters.",
      },
      { status: 400 }
    );
  return {
    messages,
    ticket,
    conversationId: body.context.conversationId.toLowerCase(),
    mode,
  };
}
