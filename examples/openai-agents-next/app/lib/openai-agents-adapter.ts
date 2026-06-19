import { Agent, run, type AgentInputItem } from "@openai/agents";
import { createPersonaSSEStream, type ChatMessage } from "./persona-wire";

/**
 * Adapter: OpenAI Agents SDK (`@openai/agents`) → Persona SSE.
 *
 * Runs a pre-built `Agent` with `run(agent, input, { stream: true })` and reads
 * incremental assistant text from the streamed events: a `raw_model_stream_event`
 * whose `data.type === "output_text_delta"` carries each token in `data.delta`.
 *
 * The `Agent` is **injected**, so tests build it with a mock model
 * (`aisdk(new MockLanguageModelV3(...))`) while the route builds it with a real
 * OpenAI model string. The adapter itself never names a provider or key.
 */

type CreateOpenAIAgentsPersonaHandlerOptions = {
  agent: Agent;
  getMessages: (body: unknown) => ChatMessage[];
};

export function createOpenAIAgentsPersonaHandler({
  agent,
  getMessages,
}: CreateOpenAIAgentsPersonaHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    const body = await req.json();
    const input = toAgentInput(getMessages(body));

    return createPersonaSSEStream(async ({ emit }) => {
      const result = await run(agent, input, { stream: true });

      for await (const event of result) {
        if (event.type === "raw_model_stream_event") {
          const data = event.data as { type?: string; delta?: string };
          if (data.type === "output_text_delta" && data.delta) {
            emit.textDelta(data.delta);
          }
        }
      }

      emit.complete();
    });
  };
}

/** A single user turn is sent as a string; multi-turn history as input items. */
function toAgentInput(messages: ChatMessage[]): string | AgentInputItem[] {
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length === 1 && turns[0]!.role === "user") return turns[0]!.content;
  return turns.map((m) => ({ role: m.role, content: m.content })) as AgentInputItem[];
}
