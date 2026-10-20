import OpenAI from "openai";
import { createOpenAIResponsesPersonaHandler } from "../../../lib/openai-responses-adapter";
import {
  personaMessagesToOpenAIInput,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

const reasoningEffort = process.env.OPENAI_RESPONSES_REASONING_EFFORT;
const maxOutputTokens = Number(process.env.OPENAI_RESPONSES_MAX_OUTPUT_TOKENS);

export const POST = createOpenAIResponsesPersonaHandler({
  client: () => new OpenAI(),
  model: process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4.1-mini",
  instructions: "You are a concise assistant explaining Persona adapter examples.",
  requestOptions: {
    ...(reasoningEffort === "none" || reasoningEffort === "minimal" || reasoningEffort === "low" ||
      reasoningEffort === "medium" || reasoningEffort === "high" || reasoningEffort === "xhigh"
      ? { reasoning: { effort: reasoningEffort } }
      : {}),
    ...(process.env.OPENAI_RESPONSES_WEB_SEARCH === "true" ? { tools: [{ type: "web_search" as const }] } : {}),
    ...(Number.isInteger(maxOutputTokens) && maxOutputTokens > 0 ? { max_output_tokens: maxOutputTokens } : {}),
  },
  getInput(body) {
    return personaMessagesToOpenAIInput((body as PersonaDispatchBody).messages);
  },
});
