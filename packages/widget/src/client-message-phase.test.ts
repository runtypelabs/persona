import { describe, expect, it } from "vitest";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, AgentWidgetMessage, AgentWidgetStreamCheckpoint } from "./types";

type Frame = Record<string, unknown>;
const stream = (frames: Frame[]) => new ReadableStream<Uint8Array>({ start(controller) {
  frames.forEach((frame, index) => controller.enqueue(new TextEncoder().encode(`id: ${index + 1}\ndata: ${JSON.stringify({ executionId: "run", ...frame })}\n\n`)));
  controller.close();
} });
const messageEvents = (events: AgentWidgetEvent[]) => events.flatMap(event => event.type === "message" ? [event.message] : []);
async function read(frames: Frame[], resume?: AgentWidgetMessage[], checkpoint?: AgentWidgetStreamCheckpoint) {
  const events: AgentWidgetEvent[] = [];
  const client = new AgentWidgetClient({ apiUrl: "/test", backgroundConversations: { capabilities: { durableExecution: true, readOnlyReplay: true }, reconnectStream: async () => new Response() } });
  await client.processStream(stream(frames), event => events.push(event), resume?.[0]?.id, undefined, undefined, resume, checkpoint);
  return events;
}
const block = (id: string, phase: unknown, text = id): Frame[] => [
  { type: "text_start", id, phase }, { type: "text_delta", id, delta: text }, { type: "text_complete", id },
];

describe("native optional assistant phases", () => {
  it.each(["agent", "flow", "nested"])("stamps phase before the first visible %s block emission and preserves it on every update", async path => {
    const frames = [
      { type: "execution_start", kind: path === "flow" ? "flow" : "agent", agentName: "Test" },
      ...block("progress", "commentary", "Checking"),
      ...block("partial", "partial_answer", "First answer"),
      ...block("answer", "final_answer", "Final answer"),
    ];
    if (path === "nested") frames.forEach(frame => { if (frame.type === "text_start") Object.assign(frame, { parentToolCallId: "parent" }); });
    const messages = messageEvents(await read(frames));
    for (const [id, phase] of [["progress", "commentary"], ["partial", "partial_answer"], ["answer", "final_answer"]]) {
      const updates = messages.filter(message => message.agentMetadata?.textBlockId === id);
      expect(updates.length).toBeGreaterThan(1);
      expect(updates.every(message => message.agentMetadata?.phase === phase)).toBe(true);
      expect(updates.every(message => message.agentMetadata?.executionId === "run")).toBe(true);
    }
    expect(new Set(messages.map(message => message.id)).size).toBe(3);
  });

  it.each([undefined, null, "unknown", "COMMENTARY", 42, {}, ["commentary"]])("leaves invalid/missing phase %j unclassified without bleeding from a preceding block", async phase => {
    const messages = messageEvents(await read([...block("known", "commentary"), ...block("unknown", phase)]));
    expect(messages.filter(message => message.agentMetadata?.textBlockId === "known").every(message => message.agentMetadata?.phase === "commentary")).toBe(true);
    expect(messages.filter(message => message.agentMetadata?.textBlockId === "unknown").every(message => message.agentMetadata?.phase === undefined)).toBe(true);
  });

  it("keeps late authoritative phase for history without changing the first-render placement", async () => {
    const messages = messageEvents(await read([
      { type: "text_start", id: "late" },
      { type: "text_delta", id: "late", delta: "Already visible", phase: "commentary" },
      { type: "text_complete", id: "late", phase: "commentary" },
    ]));
    expect(messages.every(message => message.agentMetadata?.phase === undefined)).toBe(true);
    expect(messages.at(-1)?.agentMetadata?.providerPhase).toBe("commentary");
    const classified = messageEvents(await read([
      { type: "text_start", id: "known", phase: "commentary" },
      { type: "text_delta", id: "known", delta: "Progress" },
      { type: "text_complete", id: "known", phase: "final_answer" },
    ]));
    expect(classified.at(-1)?.agentMetadata).toMatchObject({ phase: "commentary", providerPhase: "final_answer" });
  });

  it("retains the placement phase through reconnect and does not inherit it into a new block", async () => {
    const prior = await read([{ type: "text_start", id: "open", phase: "partial_answer" }, { type: "text_delta", id: "open", delta: "A" }]);
    const saved = messageEvents(prior).at(-1)!;
    const checkpoint = prior.flatMap(event => event.type === "cursor" && event.checkpoint ? [event.checkpoint] : []).at(-1)!;
    const messages = messageEvents(await read([
      { type: "text_delta", id: "open", delta: "B" }, { type: "text_complete", id: "open" }, ...block("next", undefined),
    ], [JSON.parse(JSON.stringify(saved))], JSON.parse(JSON.stringify(checkpoint))));
    expect(messages.find(message => message.content === "AB")?.agentMetadata?.phase).toBe("partial_answer");
    expect(messages.filter(message => message.agentMetadata?.textBlockId === "next").every(message => message.agentMetadata?.phase === undefined)).toBe(true);
  });

  it("checkpoints a phase even if the transport drops before the first text token", async () => {
    const prior = await read([{ type: "text_start", id: "waiting", phase: "commentary" }]);
    expect(messageEvents(prior)).toEqual([]);
    const checkpoint = prior.flatMap(event => event.type === "cursor" && event.checkpoint ? [event.checkpoint] : []).at(-1)!;
    const messages = messageEvents(await read([{ type: "text_delta", id: "waiting", delta: "Started" }], undefined, checkpoint));
    expect(messages[0].agentMetadata?.phase).toBe("commentary");
  });

  it("attaches execution identity before the first reasoning emission, including close-only reflections", async () => {
    const messages = messageEvents(await read([
      { type: "reasoning_start", id: "reason" }, { type: "reasoning_delta", id: "reason", delta: "Inspect" },
      { type: "reasoning_complete", id: "reason" }, { type: "reasoning_complete", id: "reflection", text: "Reconsider" },
    ]));
    expect(messages.every(message => message.agentMetadata?.executionId === "run")).toBe(true);
  });
});

it.each(["proxy", "agent"])("replays known assistant phase in %s dispatch history while omitting private widget metadata", async mode => {
  let request: { messages: Record<string, unknown>[] } | undefined;
  const client = new AgentWidgetClient({
    apiUrl: "/test", ...(mode === "agent" ? { agent: { name: "Test", model: "openai:test", systemPrompt: "test" } } : {}),
    customFetch: async (_url, init) => {
      request = JSON.parse(init?.body as string);
      return new Response(stream([{ type: "execution_complete", kind: "agent", success: true }]));
    },
  });
  const base = { createdAt: "2026-01-01", content: "text" };
  await client.dispatch({ messages: [
    { ...base, id: "user", role: "user", agentMetadata: { phase: "commentary" } },
    { ...base, id: "early", role: "assistant", agentMetadata: { phase: "partial_answer", executionId: "private" }, turnActivity: { id: "private", kind: "final" } },
    { ...base, id: "late", role: "assistant", agentMetadata: { providerPhase: "final_answer" } },
    { ...base, id: "invalid", role: "assistant", agentMetadata: { phase: "unknown" } } as unknown as AgentWidgetMessage,
    { ...base, id: "plain", role: "assistant" },
  ] }, () => {});
  expect(request?.messages.map(message => message.phase)).toEqual([undefined, "partial_answer", "final_answer", undefined, undefined]);
  expect(JSON.stringify(request)).not.toMatch(/agentMetadata|turnActivity|private/);
});

it("applies late completions to their own text block without closing or reclassifying the next block", async () => {
  const messages = messageEvents(await read([
    { type: "text_start", id: "first" }, { type: "text_delta", id: "first", delta: "First part" },
    { type: "text_start", id: "second" }, { type: "text_delta", id: "second", delta: "Second" },
    { type: "text_complete", id: "first", phase: "commentary" },
    { type: "text_delta", id: "second", delta: " part" }, { type: "text_complete", id: "second", phase: "final_answer" },
  ]));
  const final = new Map(messages.map(message => [message.agentMetadata?.textBlockId, message]));
  expect(final.size).toBe(2);
  expect(final.get("first")).toMatchObject({ content: "First part", streaming: false, agentMetadata: { providerPhase: "commentary" } });
  expect(final.get("second")).toMatchObject({ content: "Second part", streaming: false, agentMetadata: { providerPhase: "final_answer" } });
  expect(messages.every(message => message.agentMetadata?.phase === undefined)).toBe(true);
});

it("preserves phase and checkpoint closure when a resumed block completes without another token", async () => {
  const prior = await read([{ type: "text_start", id: "open", phase: "commentary" }, { type: "text_delta", id: "open", delta: "Progress" }]);
  const saved = messageEvents(prior).at(-1)!;
  const checkpoint = prior.flatMap(event => event.type === "cursor" && event.checkpoint ? [event.checkpoint] : []).at(-1)!;
  const events = await read([{ type: "text_complete", id: "open", phase: "final_answer" }], [saved], checkpoint);
  expect(messageEvents(events).at(-1)).toMatchObject({ streaming: false, agentMetadata: { phase: "commentary", providerPhase: "final_answer" } });
  expect(events.flatMap(event => event.type === "cursor" && event.checkpoint ? [event.checkpoint] : []).at(-1)?.openAssistant).toBe(false);
});
