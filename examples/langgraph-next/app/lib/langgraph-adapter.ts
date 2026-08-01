import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { createPersonaSSEStream, type ChatMessage } from "./persona-wire";

/**
 * Adapter: LangGraph.js (`@langchain/langgraph`) → Persona SSE.
 *
 * Builds a minimal single-node `StateGraph` (the core LangGraph primitive) whose
 * one node calls the chat model, then streams the run with
 * `graph.streamEvents(input, { version: "v2" })`. Token deltas arrive as
 * `on_chat_model_stream` events whose `data.chunk.content` carries each chunk;
 * each becomes a `text_delta`. The finished message on `on_chat_model_end`
 * carries `tool_calls`, which become fire-and-forget Persona tool frames.
 *
 * The chat model is an **injected dependency**, so the test passes a
 * `FakeStreamingChatModel` (no provider, no key) while the route passes a real
 * `ChatOpenAI`.
 */

type CreateLangGraphPersonaHandlerOptions = {
  llm: BaseChatModel;
  systemPrompt?: string;
  getMessages: (body: unknown) => ChatMessage[];
  /**
   * Follow-up steering appended to the system prompt. `true` (default) uses the
   * built-in line, a string replaces it, `false` disables it. With no prompt and
   * no steering the run emits no system message at all.
   */
  followUpSteering?: boolean | string;
};

/**
 * The built-in `suggest_replies` tool, declared in LangChain's plain
 * `StructuredToolParams` shape: `{ name, description, schema }` with a JSON
 * Schema. Every `bindTools` implementation accepts it, so the example needs no
 * zod dependency.
 *
 * There is no `execute`/`ToolNode` counterpart on purpose: the graph ends after
 * the model node and the adapter re-emits the call as a completed Persona tool
 * frame, so the run never pauses.
 */
const SUGGEST_REPLIES_TOOL = {
  name: "suggest_replies",
  description:
    "Offer the user tappable quick-reply suggestions for their next message. " +
    "Call at most once per turn, as the last action after your reply text is " +
    "complete. Give each suggestion a `label` with the short visible text, an " +
    "optional `prompt` with the fuller text placed as the user's message " +
    "(defaults to the label), and an optional `description` with one line of " +
    "supporting copy. Suggestions are sent as the user's next message, so " +
    'phrase prompts in the user\'s voice (e.g. "Tell me more about pricing").',
  schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        description: "1-4 short, distinct follow-up replies, phrased in the user's voice.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", minLength: 1, maxLength: 80 },
            prompt: { type: "string", minLength: 1, maxLength: 500 },
            description: { type: "string", minLength: 1, maxLength: 160 },
          },
          required: ["label"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  },
};

/** The tool description is not steering on its own; the system prompt sets call frequency. */
const SUGGEST_REPLIES_STEERING =
  "After answering, offer 2-3 follow-up suggestions with the suggest_replies tool, " +
  "phrased in the user's voice.";

/** Nothing runs on the page, so the result only confirms the chips were shown. */
const SUGGEST_REPLIES_RESULT = {
  content: [{ type: "text", text: "Suggestions shown to the user." }],
};

export function createLangGraphPersonaHandler({
  llm,
  systemPrompt,
  getMessages,
  followUpSteering = true,
}: CreateLangGraphPersonaHandlerOptions) {
  const steering =
    followUpSteering === false
      ? undefined
      : followUpSteering === true
        ? SUGGEST_REPLIES_STEERING
        : followUpSteering;
  // `bindTools` is optional on `BaseChatModel`; a model without it just streams text.
  const model: Runnable<BaseLanguageModelInput, BaseMessage> =
    llm.bindTools?.([SUGGEST_REPLIES_TOOL]) ?? llm;

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("model", async (state) => ({ messages: [await model.invoke(state.messages)] }))
    .addEdge(START, "model")
    .addEdge("model", END)
    .compile();

  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const messages = toLangChainMessages(getMessages(body), systemPrompt, steering);

    return createPersonaSSEStream(async ({ emit }) => {
      for await (const event of graph.streamEvents({ messages }, { version: "v2" })) {
        if (event.event === "on_chat_model_stream") {
          const delta = extractContent((event.data as { chunk?: { content?: unknown } })?.chunk?.content);
          if (delta) emit.textDelta(delta);
          continue;
        }
        // The aggregated message closing the model run carries parsed `tool_calls`;
        // the streamed `tool_call_chunks` are partial JSON and never read here.
        if (event.event === "on_chat_model_end") {
          const output = (event.data as { output?: { tool_calls?: ToolCall[] } })?.output;
          for (const call of output?.tool_calls ?? []) {
            emit.toolCall(call.name, call.args, {
              toolCallId: call.id,
              // Same canned payload every Persona example puts on tool_complete.
              ...(call.name === SUGGEST_REPLIES_TOOL.name
                ? { result: SUGGEST_REPLIES_RESULT }
                : {}),
            });
          }
        }
      }

      emit.complete();
    });
  };
}

type ToolCall = { name: string; args: unknown; id?: string };

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

function toLangChainMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
  steering?: string,
): BaseMessageLike[] {
  const result: BaseMessageLike[] = [];
  const system = [systemPrompt, steering].filter(Boolean).join(" ");
  // No prompt and no steering: emit no system message at all.
  if (system) result.push({ role: "system", content: system });
  for (const m of messages) result.push({ role: m.role, content: m.content });
  return result;
}
