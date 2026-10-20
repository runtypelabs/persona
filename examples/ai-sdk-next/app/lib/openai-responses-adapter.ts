import OpenAI from "openai";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { createPersonaSSEStream, type PersonaTextPhase } from "./persona-wire";

type OpenAIInput = Parameters<OpenAI["responses"]["create"]>[0]["input"];

type CreateOpenAIResponsesPersonaHandlerOptions = {
  client: OpenAI | (() => OpenAI);
  model: string;
  instructions?: string;
  /** Server-owned options; never forward an unchecked browser request here. */
  requestOptions?: Pick<ResponseCreateParamsStreaming, "reasoning" | "tools" | "tool_choice" | "max_output_tokens">;
  getInput: (body: unknown) => OpenAIInput;
};

function textPhase(phase: unknown): PersonaTextPhase | undefined {
  return phase === "commentary" || phase === "partial_answer" || phase === "final_answer"
    ? phase
    : undefined;
}

export function createOpenAIResponsesPersonaHandler({
  client,
  model,
  instructions,
  requestOptions,
  getInput,
}: CreateOpenAIResponsesPersonaHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const input = getInput(body);
    const resolvedClient = typeof client === "function" ? client() : client;

    return createPersonaSSEStream(async ({ emit, signal }) => {
      const stream = await resolvedClient.responses.create({
        ...requestOptions,
        model,
        instructions,
        input,
        stream: true,
      }, { signal });
      const itemPhases = new Map<string, PersonaTextPhase | undefined>();
      const itemBlocks = new Map<string, Set<string>>();
      const searchCalls = new Set<string>();

      for await (const event of stream) {
        if (event.type === "response.output_item.added" && event.item.type === "message") {
          itemPhases.set(event.item.id, textPhase(event.item.phase));
        } else if (event.type === "response.output_item.added" && event.item.type === "web_search_call") {
          searchCalls.add(event.item.id);
          emit.toolStart("web_search", event.item.action ?? {}, {
            toolCallId: event.item.id,
            toolType: "server",
          });
        } else if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
          // One Persona block per provider item/content part, even when adjacent
          // messages have the same phase. Phase is frozen at the first delta:
          // metadata first supplied by output_item.done cannot relocate text
          // already visible to the user. Missing phase remains unclassified.
          const id = `${event.item_id}:${event.content_index}`;
          const blocks = itemBlocks.get(event.item_id) ?? new Set<string>();
          blocks.add(id);
          itemBlocks.set(event.item_id, blocks);
          emit.textDelta(event.delta, { id, phase: itemPhases.get(event.item_id) });
        } else if (event.type === "response.output_item.done") {
          const item = event.item;
          if (item.id) {
            const phase = item.type === "message" ? textPhase(item.phase) : undefined;
            // The final provider phase is history-only; it never changes the
            // phase frozen into text_start or moves already-rendered text.
            for (const id of itemBlocks.get(item.id) ?? []) emit.textComplete(id, { phase });
            itemBlocks.delete(item.id);
          }
          if (item.type === "web_search_call" && searchCalls.delete(item.id)) {
            emit.toolComplete(item.id, item, item.status === "completed");
          }
        } else if (event.type === "response.completed") {
          emit.complete();
          return;
        } else if (event.type === "response.failed") {
          emit.error(event.response.error?.message ?? "OpenAI response failed");
          return;
        } else if (event.type === "response.incomplete") {
          emit.error(`OpenAI response incomplete: ${event.response.incomplete_details?.reason ?? "unknown reason"}`);
          return;
        } else if (event.type === "error") {
          emit.error(event.message ?? "OpenAI stream failed");
          return;
        }
      }

      // A closed connection is not proof of a successful response.
      signal.throwIfAborted();
      emit.error("OpenAI stream ended before response.completed");
    }, { signal: req.signal });
  };
}
