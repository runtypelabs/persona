import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageLike } from "@langchain/core/messages";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { createPersonaSSEStream, type ChatMessage } from "./persona-wire";

/**
 * Adapter: LangGraph.js (`@langchain/langgraph`) → Persona SSE.
 *
 * Builds a minimal single-node `StateGraph` (the core LangGraph primitive) whose
 * one node calls the chat model, then streams the run with
 * `graph.streamEvents(input, { version: "v2" })`. Token deltas arrive as
 * `on_chat_model_stream` events whose `data.chunk.content` carries each chunk;
 * each becomes a `text_delta`.
 *
 * The chat model is an **injected dependency**, so the test passes a
 * `FakeStreamingChatModel` (no provider, no key) while the route passes a real
 * `ChatOpenAI`.
 */

type CreateLangGraphPersonaHandlerOptions = {
  llm: BaseChatModel;
  systemPrompt?: string;
  getMessages: (body: unknown) => ChatMessage[];
};

export function createLangGraphPersonaHandler({
  llm,
  systemPrompt,
  getMessages,
}: CreateLangGraphPersonaHandlerOptions) {
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("model", async (state) => ({ messages: [await llm.invoke(state.messages)] }))
    .addEdge(START, "model")
    .addEdge("model", END)
    .compile();

  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const messages = toLangChainMessages(getMessages(body), systemPrompt);

    return createPersonaSSEStream(async ({ emit }) => {
      for await (const event of graph.streamEvents({ messages }, { version: "v2" })) {
        if (event.event === "on_chat_model_stream") {
          const delta = extractContent((event.data as { chunk?: { content?: unknown } })?.chunk?.content);
          if (delta) emit.textDelta(delta);
        }
      }

      emit.complete();
    });
  };
}

/** A LangChain message `content` is a string or an array of typed content blocks. */
function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
          return String((block as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function toLangChainMessages(messages: ChatMessage[], systemPrompt?: string): BaseMessageLike[] {
  const result: BaseMessageLike[] = [];
  if (systemPrompt) result.push({ role: "system", content: systemPrompt });
  for (const m of messages) result.push({ role: m.role, content: m.content });
  return result;
}
