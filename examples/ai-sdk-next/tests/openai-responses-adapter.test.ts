import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { createOpenAIResponsesPersonaHandler } from "../app/lib/openai-responses-adapter";
import { personaMessagesToOpenAIInput, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// Responses API-shaped fixtures, decoded by the real OpenAI SDK's SSE reader.
// No text suffixes, prompts, or event ordering are used to classify phases.
type ProviderEvent = Record<string, unknown> & { type: string };
const added = (id: string, phase?: string): ProviderEvent => ({
  type: "response.output_item.added", output_index: 0,
  item: { id, type: "message", role: "assistant", status: "in_progress", content: [], ...(phase ? { phase } : {}) },
});
const delta = (id: string, text: string, contentIndex = 0): ProviderEvent => ({
  type: "response.output_text.delta", item_id: id, output_index: 0, content_index: contentIndex, delta: text,
});
const done = (id: string, phase?: string): ProviderEvent => ({
  type: "response.output_item.done", output_index: 0,
  item: { id, type: "message", role: "assistant", status: "completed", content: [], ...(phase ? { phase } : {}) },
});
const completed: ProviderEvent = { type: "response.completed", response: { id: "resp_test", status: "completed" } };

function handlerFor(events: ProviderEvent[], requestOptions = {}) {
  const fetch = vi.fn(async () => new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  ));
  const client = new OpenAI({ apiKey: "offline-test", fetch });
  return {
    fetch,
    handle: createOpenAIResponsesPersonaHandler({
      client, model: "offline-model", requestOptions,
      getInput: (body) => personaMessagesToOpenAIInput((body as PersonaDispatchBody).messages),
    }),
  };
}

describe("OpenAI Responses adapter → phased Persona blocks", () => {
  it("preserves provider message IDs and phases with a stable run and turn", async () => {
    const { handle } = handlerFor([
      added("msg_update", "commentary"), delta("msg_update", "Checking sources."), done("msg_update", "commentary"),
      added("msg_answer", "final_answer"), delta("msg_answer", "The answer is "), delta("msg_answer", "42."), done("msg_answer", "final_answer"),
      completed,
    ]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    const starts = frames.filter((frame) => frame.event === "text_start");
    expect(starts.map((frame) => ({ id: frame.data.id, phase: frame.data.phase }))).toEqual([
      { id: "msg_update:0", phase: "commentary" }, { id: "msg_answer:0", phase: "final_answer" },
    ]);
    expect(frames.filter((frame) => frame.event === "text_complete").map((frame) => frame.data.id)).toEqual(["msg_update:0", "msg_answer:0"]);
    expect(frames.filter((frame) => frame.event === "turn_start")).toHaveLength(1);
    expect(summarizeWire(frames)).toMatchObject({ text: "Checking sources.The answer is 42.", success: true, seqMonotonic: true });
    expect(summarizeWire(frames).executionIds.size).toBe(1);
  });

  it("retains distinct content parts and adjacent messages with identical phase", async () => {
    const { handle } = handlerFor([
      added("msg_a", "commentary"), delta("msg_a", "First", 0), delta("msg_a", "Second", 1), done("msg_a", "commentary"),
      added("msg_b", "commentary"), delta("msg_b", "Third"), done("msg_b", "commentary"), completed,
    ]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    expect(frames.filter((frame) => frame.event === "text_start").map((frame) => frame.data.id))
      .toEqual(["msg_a:0", "msg_a:1", "msg_b:0"]);
  });

  it.each([undefined, "unknown_future_phase"])("leaves absent or unknown phase %s unclassified", async (phase) => {
    const { handle } = handlerFor([added("msg", phase), delta("msg", "Ordinary answer"), done("msg", phase), completed]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    expect(frames.find((frame) => frame.event === "text_start")?.data).not.toHaveProperty("phase");
    expect(summarizeWire(frames).text).toBe("Ordinary answer");
  });

  it("keeps late phase out of text_start and preserves it for history on text_complete", async () => {
    const { handle } = handlerFor([
      added("msg"), delta("msg", "Already visible"),
      { type: "response.output_text.done", item_id: "msg", content_index: 0, text: "Already visible" },
      done("msg", "commentary"), completed,
    ]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    expect(frames.filter((frame) => frame.event === "text_start")).toHaveLength(1);
    expect(frames.find((frame) => frame.event === "text_start")?.data).not.toHaveProperty("phase");
    expect(frames.find((frame) => frame.event === "text_complete")?.data.phase).toBe("commentary");
  });

  it("does not invent a final answer when a commentary message is the final item", async () => {
    const { handle } = handlerFor([added("msg", "commentary"), delta("msg", "An update"), done("msg", "commentary"), completed]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    expect(frames.filter((frame) => frame.event === "text_start").map((frame) => frame.data.phase)).toEqual(["commentary"]);
  });

  it("passes the normalized partial_answer phase without treating it as final", async () => {
    const { handle } = handlerFor([added("msg", "partial_answer"), delta("msg", "Part one"), done("msg", "partial_answer"), completed]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    expect(frames.find((frame) => frame.event === "text_start")?.data.phase).toBe("partial_answer");
  });

  it("emits live hosted search lifecycle using the provider's actual result", async () => {
    const search = { id: "ws_1", type: "web_search_call", status: "completed", action: { type: "search", query: "official docs" } };
    const { handle } = handlerFor([
      added("msg_update", "commentary"), delta("msg_update", "Searching"), done("msg_update", "commentary"),
      { type: "response.output_item.added", output_index: 1, item: { id: "ws_1", type: "web_search_call", status: "in_progress" } },
      { type: "response.output_item.done", output_index: 1, item: search },
      added("msg_answer", "final_answer"), delta("msg_answer", "Found it"), done("msg_answer", "final_answer"), completed,
    ], { tools: [{ type: "web_search" }], reasoning: { effort: "low" }, max_output_tokens: 2048 });
    const frames = await collectSSE(await handle(dispatchRequest()));
    const start = frames.findIndex((frame) => frame.event === "tool_start");
    const finish = frames.findIndex((frame) => frame.event === "tool_complete");
    expect(start).toBeGreaterThan(frames.findIndex((frame) => frame.event === "text_complete"));
    expect(finish).toBeGreaterThan(start);
    expect(frames[start].data).toMatchObject({ toolCallId: "ws_1", toolName: "web_search", toolType: "server" });
    expect(frames[finish].data).toMatchObject({ toolCallId: "ws_1", success: true, result: search });
  });

  it.each([
    [{ type: "response.failed", response: { error: { message: "Provider failed" } } }, "Provider failed"],
    [{ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }, "max_output_tokens"],
    [{ type: "error", message: "Provider stream error" }, "Provider stream error"],
  ])("surfaces provider terminal failure %j without success", async (terminal, message) => {
    const { handle } = handlerFor([added("msg", "commentary"), delta("msg", "Partial"), terminal as ProviderEvent]);
    const frames = await collectSSE(await handle(dispatchRequest()));
    expect(summarizeWire(frames)).toMatchObject({ text: "Partial", errored: true, success: false });
    expect(frames.at(-1)?.data.error.message).toContain(message);
  });

  it("treats an unexpected EOF as failure rather than completion", async () => {
    const { handle } = handlerFor([added("msg"), delta("msg", "Partial")]);
    expect(summarizeWire(await collectSSE(await handle(dispatchRequest())))).toMatchObject({ errored: true, success: false });
  });

  it.each(["request", "reader"])("propagates %s cancellation into the OpenAI request", async (source) => {
    let providerSignal: AbortSignal | null | undefined;
    let markFetched: () => void = () => {};
    const fetched = new Promise<void>((resolve) => { markFetched = resolve; });
    const client = new OpenAI({
      apiKey: "offline-test", maxRetries: 0,
      fetch: async (_url, init) => {
        providerSignal = init?.signal;
        markFetched();
        return new Promise<Response>((_resolve, reject) => {
          providerSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      },
    });
    const handle = createOpenAIResponsesPersonaHandler({ client, model: "offline", getInput: () => "hi" });
    const abort = new AbortController();
    const request = new Request(dispatchRequest(), { signal: abort.signal });
    const response = await handle(request);
    await fetched;
    if (source === "request") {
      abort.abort();
      const frames = await collectSSE(response);
      expect(summarizeWire(frames)).toMatchObject({ errored: true, success: false });
    } else {
      await response.body?.cancel("Reader disconnected");
    }
    expect(providerSignal?.aborted).toBe(true);
  });
});

describe("OpenAI assistant history phase", () => {
  it("preserves known phases, leaves unknown messages alone, and never labels users", () => {
    expect(personaMessagesToOpenAIInput([
      { role: "assistant", content: "Update", phase: "commentary" },
      { role: "assistant", content: "Answer", agentMetadata: { phase: "final_answer" } },
      { role: "assistant", content: "Plain" },
      { role: "assistant", content: "Partial", phase: "partial_answer" },
      { role: "user", content: "Next", phase: "final_answer" },
    ])).toEqual([
      { role: "assistant", content: "Update", phase: "commentary" },
      { role: "assistant", content: "Answer", phase: "final_answer" },
      { role: "assistant", content: "Plain" },
      { role: "assistant", content: "Partial" },
      { role: "user", content: "Next" },
    ]);
  });
});
