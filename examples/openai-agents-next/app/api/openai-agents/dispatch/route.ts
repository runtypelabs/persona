import { Agent } from "@openai/agents";
import { createOpenAIAgentsPersonaHandler } from "../../../lib/openai-agents-adapter";
import {
  personaMessagesToChat,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

// A string model id uses the SDK's default OpenAI provider (OPENAI_API_KEY).
const agent = new Agent({
  name: "Assistant",
  instructions: "You are a concise assistant explaining Persona adapter examples.",
  model: process.env.OPENAI_AGENTS_MODEL ?? "gpt-4.1-mini",
});

export const POST = createOpenAIAgentsPersonaHandler({
  agent,
  getMessages(body) {
    return personaMessagesToChat((body as PersonaDispatchBody).messages);
  },
});
