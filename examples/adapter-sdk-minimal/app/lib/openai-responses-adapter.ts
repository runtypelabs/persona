import OpenAI from "openai";
import { createPersonaSSEStream } from "./persona-wire";

type OpenAIInput = Parameters<OpenAI["responses"]["create"]>[0]["input"];

type CreateOpenAIResponsesPersonaHandlerOptions = {
  client: OpenAI | (() => OpenAI);
  model: string;
  instructions?: string;
  getInput: (body: unknown) => OpenAIInput;
};

type OpenAIStreamEvent = {
  type?: string;
  delta?: string;
  response?: {
    output_text?: string;
    error?: { message?: string | null } | null;
  };
  error?: { message?: string | null } | null;
};

export function createOpenAIResponsesPersonaHandler({
  client,
  model,
  instructions,
  getInput,
}: CreateOpenAIResponsesPersonaHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const input = getInput(body);
    const resolvedClient = typeof client === "function" ? client() : client;

    return createPersonaSSEStream(async ({ emit }) => {
      const stream = await resolvedClient.responses.create({
        model,
        instructions,
        input,
        stream: true,
      });

      let fullText = "";

      for await (const rawEvent of stream) {
        const event = rawEvent as OpenAIStreamEvent;

        if (event.type === "response.output_text.delta") {
          const delta = event.delta ?? "";
          fullText += delta;
          emit.stepChunk(delta);
        } else if (event.type === "response.completed") {
          const completedText = event.response?.output_text;
          emit.stepComplete(completedText ?? fullText);
          emit.flowComplete();
          return;
        } else if (event.type === "response.failed") {
          emit.error(event.response?.error?.message ?? "OpenAI response failed");
          return;
        } else if (event.type === "error") {
          emit.error(event.error?.message ?? "OpenAI stream failed");
          return;
        }
      }

      emit.stepComplete(fullText);
      emit.flowComplete();
    });
  };
}
