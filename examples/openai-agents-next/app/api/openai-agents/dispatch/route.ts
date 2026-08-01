import { Agent } from "@openai/agents";
import {
  createOpenAIAgentsPersonaHandler,
  SUGGEST_REPLIES_INSTRUCTIONS,
  SUGGEST_REPLIES_TOOL_USE_BEHAVIOR,
  suggestRepliesTool,
} from "../../../lib/openai-agents-adapter";
import {
  personaMessagesToChat,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

// A string model id uses the SDK's default OpenAI provider (OPENAI_API_KEY).
const agent = new Agent({
  name: "Assistant",
  instructions: [
    "You are a concise assistant explaining Persona adapter examples.",
    SUGGEST_REPLIES_INSTRUCTIONS,
  ].join(" "),
  model: process.env.OPENAI_AGENTS_MODEL ?? "gpt-4.1-mini",
  tools: [suggestRepliesTool],
  toolUseBehavior: SUGGEST_REPLIES_TOOL_USE_BEHAVIOR,
});

export const POST = createOpenAIAgentsPersonaHandler({
  agent,
  getMessages(body) {
    return personaMessagesToChat((body as PersonaDispatchBody).messages);
  },
});
