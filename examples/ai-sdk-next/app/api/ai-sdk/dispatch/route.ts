import { openai } from "@ai-sdk/openai";
import { createAISDKPersonaHandler } from "../../../lib/ai-sdk-adapter";
import {
  personaMessagesToModelMessages,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

export const POST = createAISDKPersonaHandler({
  model: openai(process.env.AI_SDK_MODEL ?? "gpt-4.1-mini"),
  system: "You are a concise assistant explaining Persona adapter examples.",
  getMessages(body) {
    return personaMessagesToModelMessages((body as PersonaDispatchBody).messages);
  },
});
