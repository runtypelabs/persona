import {
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { createPersonaSSEStream } from "./persona-wire";

type CreateAISDKPersonaHandlerOptions = {
  model: LanguageModel;
  system?: string;
  getMessages: (body: unknown) => ModelMessage[];
};

// Copy of the widget's `suggest_replies` parameters schema. Examples carry no
// workspace imports, so it is inlined rather than imported.
const SUGGEST_REPLIES_PARAMETERS_SCHEMA: JSONSchema7 = {
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
};

// Nothing runs on the page, so the result only confirms the chips were shown.
const SUGGEST_REPLIES_RESULT = {
  content: [{ type: "text", text: "Suggestions shown to the user." }],
};

const SUGGEST_REPLIES_TOOL = tool({
  description:
    "Offer the user tappable quick-reply suggestions for their next message. " +
    "Call at most once per turn, as the last action after your reply text is " +
    "complete. Give each suggestion a `label` with the short visible text, an " +
    "optional `prompt` with the fuller text placed as the user's message " +
    "(defaults to the label), and an optional `description` with one line of " +
    "supporting copy. Suggestions are sent as the user's next message, so " +
    'phrase prompts in the user\'s voice (e.g. "Tell me more about pricing").',
  inputSchema: jsonSchema(SUGGEST_REPLIES_PARAMETERS_SCHEMA),
  execute: async () => SUGGEST_REPLIES_RESULT,
});

// The tool description is passive; this instruction is what drives how often
// the model actually calls it.
const FOLLOW_UP_STEERING =
  "After answering, offer 2-3 follow-up suggestions with the suggest_replies " +
  "tool, phrased in the user's voice as the message they would send next.";

// The `expose: true` variant instead reads `body.clientTools` (where the widget
// advertises `suggest_replies`) and builds the ToolSet from it, one
// `tool({ description, inputSchema: jsonSchema(parametersSchema) })` per entry:
// see `buildTools()` in examples/ai-sdk-webmcp/app/api/chat/shim.ts, minus its
// `origin: "webmcp"` hardcode, which renames the tool and routes it to the
// page-tool bridge.
export function createAISDKPersonaHandler({
  model,
  system,
  getMessages,
}: CreateAISDKPersonaHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const messages = getMessages(body);

    return createPersonaSSEStream(async ({ emit }) => {
      const result = streamText({
        model,
        system: system ? `${system}\n\n${FOLLOW_UP_STEERING}` : FOLLOW_UP_STEERING,
        messages,
        tools: { suggest_replies: SUGGEST_REPLIES_TOOL },
        // One model call only: the chips are fire-and-forget, so there is
        // nothing to feed back for a second step.
        stopWhen: stepCountIs(1),
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          emit.textDelta(part.text);
        } else if (part.type === "tool-call" && part.toolName === "suggest_replies") {
          // `tool_start` + `tool_complete` in one go, so the matching
          // `tool-result` part needs no frame of its own.
          emit.toolCall(part.toolName, part.input, {
            toolCallId: part.toolCallId,
            result: SUGGEST_REPLIES_RESULT,
          });
        } else if (part.type === "error") {
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          emit.error(message);
          return;
        }
      }

      emit.complete();
    });
  };
}
