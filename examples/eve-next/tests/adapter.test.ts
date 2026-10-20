import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvePersonaHandler, type EveSessionStream } from "../app/lib/eve-adapter";
import { personaMessagesToChat, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { previewSession } from "../app/lib/preview-session";
import { documents } from "../app/lib/workspace";
import { POST as route } from "../app/api/eve/dispatch/route";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

const sdk = vi.hoisted(() => ({ create: vi.fn(), options: vi.fn() }));
vi.mock("eve/client", () => ({ Client: class {
  sessions = { create: sdk.create };
  constructor(options: unknown) { sdk.options(options); }
} }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const getMessages = (body: unknown) => personaMessagesToChat((body as PersonaDispatchBody).messages);
const action = { kind: "tool-call", callId: "call_read", toolName: "read_document", input: { id: "launch-brief" } };
const mockSession = (parts: string[]): EveSessionStream => async function* () {
  for (const part of parts) yield { type: "message.appended", data: { messageDelta: part } };
};

describe("Eve adapter → Persona wire", () => {
  it("streams text into one well-formed run", async () => {
    const handler = createEvePersonaHandler({ getMessages, session: mockSession(["Hello", ", ", "world"]) });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("hi"))));
    expect(summary.events[0]).toBe("execution_start");
    expect(summary.events.at(-1)).toBe("execution_complete");
    expect(summary.text).toBe("Hello, world");
    expect(summary.executionIds.size).toBe(1);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
  });

  it("forwards explicit reasoning without repeating its completed snapshot as text", async () => {
    const handler = createEvePersonaHandler({ getMessages, session: async function* () {
      yield { type: "reasoning.appended", data: { reasoningDelta: "Check the brief.", turnId: "turn1", stepIndex: 0 } };
      yield { type: "reasoning.completed", data: { reasoning: "Check the brief.", turnId: "turn1", stepIndex: 0 } };
      yield { type: "message.appended", data: { messageDelta: "Here is the answer." } };
    } });
    const frames = await collectSSE(await handler(dispatchRequest("hi")));
    expect(frames.filter((frame) => frame.event === "reasoning_delta").map((frame) => frame.data.delta)).toEqual(["Check the brief."]);
    expect(frames.find((frame) => frame.event === "reasoning_complete")?.data.id).toBe(frames.find((frame) => frame.event === "reasoning_start")?.data.id);
    expect(summarizeWire(frames).text).toBe("Here is the answer.");
  });

  it("starts a tool before its result, preserving Eve call IDs and failures", async () => {
    const handler = createEvePersonaHandler({ getMessages, session: async function* () {
      yield { type: "actions.requested", data: { actions: [action] } };
      yield { type: "message.appended", data: { messageDelta: "Checking the brief." } };
      yield { type: "action.result", data: { status: "failed", result: { callId: "call_read", output: { error: "Unavailable" }, isError: true } } };
    } });
    const frames = await collectSSE(await handler(dispatchRequest("hi")));
    const start = frames.findIndex((frame) => frame.event === "tool_start");
    const result = frames.findIndex((frame) => frame.event === "tool_complete");
    expect(result).toBeGreaterThan(start + 1);
    expect(frames[start].data.toolCallId).toBe("call_read");
    expect(frames[result].data).toMatchObject({ toolCallId: "call_read", success: false, result: { error: "Unavailable" } });
  });

  it("forwards real suggestion results rather than inventing completion", async () => {
    const suggestions = { suggestions: [{ label: "Find launch risks" }] };
    const handler = createEvePersonaHandler({ getMessages, session: async function* () {
      yield { type: "actions.requested", data: { actions: [{ ...action, toolName: "suggest_replies", input: suggestions }] } };
      yield { type: "action.result", data: { status: "completed", result: { callId: "call_read", output: { shown: true } } } };
    } });
    const frames = await collectSSE(await handler(dispatchRequest("hi")));
    expect(frames.find((frame) => frame.event === "tool_start")?.data).toMatchObject({ toolName: "suggest_replies", parameters: suggestions, toolType: "local" });
    expect(frames.find((frame) => frame.event === "tool_complete")?.data.result).toEqual({ shown: true });
  });

  it.each(["turn.failed", "session.failed", "turn.cancelled", "input.requested"])("surfaces %s as an error, never a successful turn", async (type) => {
    const handler = createEvePersonaHandler({ getMessages, session: async function* () { yield { type, data: { message: "Request failed" } }; } });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("hi"))));
    expect(summary.errored).toBe(true);
    expect(summary.events).not.toContain("execution_complete");
  });

  it("does not mark an unfinished tool as complete", async () => {
    const handler = createEvePersonaHandler({ getMessages, session: async function* () { yield { type: "actions.requested", data: { actions: [action] } }; } });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("hi"))));
    expect(summary.errored).toBe(true);
    expect(summary.events).not.toContain("tool_complete");
  });

  it("uses current typed sessions.create and forwards server authentication", async () => {
    sdk.create.mockResolvedValue({ response: mockSession(["Connected"] )({ prompt: "" }) });
    vi.stubEnv("EVE_BEARER_TOKEN", "server-only-token");
    const handler = createEvePersonaHandler({ getMessages, host: "https://agent.example.test" });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("hi"))));
    expect(summary.text).toBe("Connected");
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ message: "User: hi", signal: expect.any(AbortSignal) }));
    expect(sdk.options).toHaveBeenCalledWith({ host: "https://agent.example.test", auth: { bearer: "server-only-token" }, redirect: "error" });
  });

  it("cancels unsupported live approvals before the adapter closes its iterator", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    sdk.create.mockResolvedValue({ response: {
      cancel,
      async *[Symbol.asyncIterator]() { yield { type: "input.requested" }; },
    } });
    const handler = createEvePersonaHandler({ getMessages });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("hi"))));
    expect(summary.errored).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not expose SDK error details", async () => {
    sdk.create.mockRejectedValue(new Error("private.internal:403 secret details"));
    const handler = createEvePersonaHandler({ getMessages });
    const frames = await collectSSE(await handler(dispatchRequest("hi")));
    expect(JSON.stringify(frames)).not.toContain("private.internal");
    expect(JSON.stringify(frames)).toContain("Check the connection");
  });

  it("cancels live Eve execution when the response reader disconnects", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const cancel = vi.fn().mockResolvedValue(undefined);
    sdk.create.mockResolvedValue({ response: {
      cancel,
      async *[Symbol.asyncIterator]() {
        yield { type: "message.appended", data: { messageDelta: "Starting" } };
        await pending;
      },
    } });
    const handler = createEvePersonaHandler({ getMessages });
    const response = await handler(dispatchRequest("hi"));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();
    finish();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("handles a disconnected response consumer without enqueue errors", async () => {
    const handler = createEvePersonaHandler({ getMessages, session: previewSession(documents[0], 0) });
    const response = await handler(dispatchRequest("Summarize this document"));
    const reader = response.body!.getReader();
    await reader.read();
    await expect(reader.cancel()).resolves.toBeUndefined();
  });
});

describe("Preview and route boundaries", () => {
  it.each(documents)("summarizes $title through the adapter, with two grounded tools and suggestions", async (document) => {
    const handler = createEvePersonaHandler({ getMessages, session: previewSession(document, 0) });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("Summarize this document"))));
    expect(summary.text).toContain(document.title);
    expect(summary.toolCalls.map((call) => call.name)).toEqual(["read_document", "review_milestones", "suggest_replies"]);
    expect(summary.events).toContain("reasoning_complete");
    expect(summary.success).toBe(true);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("labels the limitations of unmatched preview questions", async () => {
    const handler = createEvePersonaHandler({ getMessages, session: previewSession(documents[0], 0) });
    const summary = summarizeWire(await collectSSE(await handler(dispatchRequest("What is the weather?"))));
    expect(summary.text).toContain("prepared responses");
  });
  it("rejects a direct live request unless live mode is enabled", async () => {
    vi.stubEnv("EVE_MODE", "preview");
    const request = new Request("http://localhost/api/eve/dispatch?mode=live", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) });
    expect((await route(request)).status).toBe(503);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it.each(["null", '{"messages":[null,{},"bad"]}', "not json"])("rejects malformed input %s without starting Eve", async (body) => {
    const response = await route(new Request("http://localhost/api/eve/dispatch", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(sdk.create).not.toHaveBeenCalled();
  });
});
