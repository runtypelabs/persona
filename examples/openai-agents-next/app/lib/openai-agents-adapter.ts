import { Agent, run, tool, type AgentInputItem } from "@openai/agents";
import { createPersonaSSEStream, type ChatMessage } from "./persona-wire";

/**
 * Adapter: OpenAI Agents SDK (`@openai/agents`) → Persona SSE.
 *
 * Runs a pre-built `Agent` with `run(agent, input, { stream: true })` and reads
 * incremental assistant text from the streamed events: a `raw_model_stream_event`
 * whose `data.type === "output_text_delta"` carries each token in `data.delta`.
 * Tool calls arrive on the higher-level `run_item_stream_event` channel and are
 * re-emitted as fire-and-forget Persona tool frames.
 *
 * The `Agent` is **injected**, so tests build it with a mock model
 * (`aisdk(new MockLanguageModelV3(...))`) while the route builds it with a real
 * OpenAI model string. The adapter itself never names a provider or key.
 */

const SUGGEST_REPLIES_TOOL_NAME = "suggest_replies";

/** The SDK runs the tool; the result only confirms the chips were shown. */
const SUGGEST_REPLIES_RESULT = {
  content: [{ type: "text", text: "Suggestions shown to the user." }],
};

type CreateOpenAIAgentsPersonaHandlerOptions = {
  agent: Agent;
  getMessages: (body: unknown) => ChatMessage[];
};

export function createOpenAIAgentsPersonaHandler({
  agent,
  getMessages,
}: CreateOpenAIAgentsPersonaHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const input = toAgentInput(getMessages(body));

    return createPersonaSSEStream(async ({ emit }) => {
      const result = await run(agent, input, { stream: true });

      for await (const event of result) {
        if (event.type === "raw_model_stream_event") {
          const data = event.data as { type?: string; delta?: string };
          if (data.type === "output_text_delta" && data.delta) {
            emit.textDelta(data.delta);
          }
          continue;
        }

        // `tool_called` fires once the SDK has a complete function call. The SDK
        // still executes the tool; the widget only needs the call to render.
        if (event.type === "run_item_stream_event" && event.name === "tool_called") {
          const rawItem = event.item.rawItem as {
            type?: string;
            callId?: string;
            name?: string;
            arguments?: string;
          };
          if (rawItem.type === "function_call" && rawItem.name) {
            emit.toolCall(rawItem.name, parseToolArguments(rawItem.arguments), {
              toolCallId: rawItem.callId,
              // Same canned payload every Persona example puts on tool_complete.
              ...(rawItem.name === SUGGEST_REPLIES_TOOL_NAME
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

/**
 * Steering for follow-up chips. Nothing injects client-tool guidance for you:
 * the tool description plus this line are what drive call frequency.
 */
export const SUGGEST_REPLIES_INSTRUCTIONS =
  "After answering, offer 2-3 follow-up suggestions with the suggest_replies " +
  "tool, phrased in the user's voice. Call it once, as the last action of the " +
  "turn, and add no commentary afterwards.";

/**
 * `suggest_replies` in the Agents SDK's own idiom: a function tool whose
 * `execute` returns a canned result, so the run continues without pausing and
 * the widget renders chips from the emitted `tool_start` frame.
 *
 * `strict: false` keeps the widget's `minItems`/`maxItems`/`maxLength` hints,
 * which strict mode rejects; the SDK's non-strict schema type in turn requires
 * `additionalProperties: true` at the top level.
 */
export const suggestRepliesTool = tool({
  name: SUGGEST_REPLIES_TOOL_NAME,
  description:
    "Offer the user tappable quick-reply suggestions for their next message. " +
    "Call at most once per turn, as the last action after your reply text is " +
    "complete. Give each suggestion a `label` with the short visible text, an " +
    "optional `prompt` with the fuller text placed as the user's message " +
    "(defaults to the label), and an optional `description` with one line of " +
    "supporting copy. Suggestions are sent as the user's next message, so " +
    'phrase prompts in the user\'s voice (e.g. "Tell me more about pricing"). ' +
    "Keep them short and distinct. The result only confirms the suggestions " +
    "were shown: do not add further commentary after calling this tool; end " +
    "your turn.",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        description:
          "1-4 short, distinct follow-up replies, phrased in the user's voice.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", maxLength: 80 },
            prompt: { type: "string", maxLength: 500 },
            description: { type: "string", maxLength: 160 },
          },
          required: ["label"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: true,
  },
  execute: async () => SUGGEST_REPLIES_RESULT,
});

/**
 * Pass as the agent's `toolUseBehavior` so the run ends on the
 * `suggest_replies` call instead of looping back for another model turn.
 */
export const SUGGEST_REPLIES_TOOL_USE_BEHAVIOR = {
  stopAtToolNames: ["suggest_replies"],
};

/** Tool arguments arrive as a JSON string; the widget wants them as an object. */
function parseToolArguments(args: string | undefined): unknown {
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

/** A single user turn is sent as a string; multi-turn history as input items. */
function toAgentInput(messages: ChatMessage[]): string | AgentInputItem[] {
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length === 1 && turns[0]!.role === "user") return turns[0]!.content;
  return turns.map((m) => ({ role: m.role, content: m.content })) as AgentInputItem[];
}
