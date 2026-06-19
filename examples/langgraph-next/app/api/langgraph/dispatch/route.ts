import { ChatOpenAI } from "@langchain/openai";
import { createLangGraphPersonaHandler } from "../../../lib/langgraph-adapter";
import {
  personaMessagesToChat,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

export const POST = createLangGraphPersonaHandler({
  llm: new ChatOpenAI({ model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini", streaming: true }),
  systemPrompt: "You are a concise assistant explaining Persona adapter examples.",
  getMessages(body) {
    return personaMessagesToChat((body as PersonaDispatchBody).messages);
  },
});
