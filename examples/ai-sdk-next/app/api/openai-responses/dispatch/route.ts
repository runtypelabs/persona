import OpenAI from "openai";
import { createOpenAIResponsesPersonaHandler } from "../../../lib/openai-responses-adapter";
import {
  personaMessagesToOpenAIInput,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

export const POST = createOpenAIResponsesPersonaHandler({
  client: () => new OpenAI(),
  model: process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4.1-mini",
  instructions: "You are a concise assistant explaining Persona adapter examples.",
  getInput(body) {
    return personaMessagesToOpenAIInput((body as PersonaDispatchBody).messages);
  },
});
