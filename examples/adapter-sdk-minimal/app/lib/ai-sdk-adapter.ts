import { streamText, type ModelMessage, type LanguageModel } from "ai";
import { createPersonaSSEStream } from "./persona-wire";

type CreateAISDKPersonaHandlerOptions = {
  model: LanguageModel;
  system?: string;
  getMessages: (body: unknown) => ModelMessage[];
};

export function createAISDKPersonaHandler({
  model,
  system,
  getMessages,
}: CreateAISDKPersonaHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const messages = getMessages(body);

    return createPersonaSSEStream(async ({ emit }) => {
      const result = streamText({ model, system, messages });
      let fullText = "";

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          fullText += part.text;
          emit.stepChunk(part.text);
        } else if (part.type === "error") {
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          emit.error(message);
          return;
        }
      }

      emit.stepComplete(fullText);
      emit.flowComplete();
    });
  };
}
