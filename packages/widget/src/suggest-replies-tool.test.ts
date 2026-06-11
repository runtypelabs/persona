import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SUGGEST_REPLIES_CLIENT_TOOL,
  SUGGEST_REPLIES_MAX,
  SUGGEST_REPLIES_PARAMETERS_SCHEMA,
  SUGGEST_REPLIES_TOOL_NAME,
  latestAgentSuggestions,
  parseSuggestRepliesPayload,
} from "./suggest-replies-tool";
import {
  ASK_USER_QUESTION_CLIENT_TOOL,
  builtInClientToolsForDispatch,
} from "./ask-user-question-tool";
import { AgentWidgetClient } from "./client";
import { AgentWidgetSession } from "./session";
import { computeClientToolsFingerprint } from "./webmcp-bridge";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

describe("SUGGEST_REPLIES_CLIENT_TOOL definition", () => {
  it("matches the tool name and origin/annotation contract", () => {
    expect(SUGGEST_REPLIES_CLIENT_TOOL.name).toBe(SUGGEST_REPLIES_TOOL_NAME);
    // `'sdk'` keeps the bare name on the wire (the server only prefixes
    // `origin: 'webmcp'` tools) so the step_await routes to the widget's
    // auto-resolve, not the WebMCP bridge.
    expect(SUGGEST_REPLIES_CLIENT_TOOL.origin).toBe("sdk");
    expect(SUGGEST_REPLIES_CLIENT_TOOL.annotations?.readOnlyHint).toBe(true);
  });

  it("bounds suggestions to 1-4 short strings", () => {
    const suggestions =
      SUGGEST_REPLIES_PARAMETERS_SCHEMA.properties.suggestions;
    expect(suggestions.minItems).toBe(1);
    expect(suggestions.maxItems).toBe(SUGGEST_REPLIES_MAX);
    expect(suggestions.items.maxLength).toBe(60);
    expect(SUGGEST_REPLIES_PARAMETERS_SCHEMA.required).toEqual(["suggestions"]);
  });
});

describe("parseSuggestRepliesPayload", () => {
  it("parses object args and JSON-string args", () => {
    expect(parseSuggestRepliesPayload({ suggestions: ["A", "B"] })).toEqual([
      "A",
      "B",
    ]);
    expect(
      parseSuggestRepliesPayload(JSON.stringify({ suggestions: ["A"] })),
    ).toEqual(["A"]);
  });

  it("drops non-strings and empty strings, trims whitespace", () => {
    expect(
      parseSuggestRepliesPayload({
        suggestions: ["  A  ", 42, "", null, "B", "   "],
      }),
    ).toEqual(["A", "B"]);
  });

  it("truncates past the cap with a console warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = parseSuggestRepliesPayload({
      suggestions: ["1", "2", "3", "4", "5", "6"],
    });
    expect(result).toEqual(["1", "2", "3", "4"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("returns [] for malformed payloads", () => {
    expect(parseSuggestRepliesPayload(undefined)).toEqual([]);
    expect(parseSuggestRepliesPayload("not json")).toEqual([]);
    expect(parseSuggestRepliesPayload({ suggestions: "oops" })).toEqual([]);
    expect(parseSuggestRepliesPayload({})).toEqual([]);
  });
});

describe("latestAgentSuggestions", () => {
  const msg = (
    overrides: Partial<AgentWidgetMessage> & { id: string },
  ): AgentWidgetMessage => ({
    role: "assistant",
    content: "",
    createdAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  });
  const suggest = (id: string, suggestions: string[]): AgentWidgetMessage =>
    msg({
      id,
      variant: "tool",
      toolCall: {
        id: `tc-${id}`,
        name: SUGGEST_REPLIES_TOOL_NAME,
        status: "complete",
        args: { suggestions },
      },
    });
  const user = (id: string): AgentWidgetMessage =>
    msg({ id, role: "user", content: "hi" });

  it("returns null when no suggest_replies message exists", () => {
    expect(latestAgentSuggestions([])).toBeNull();
    expect(latestAgentSuggestions([user("u1"), msg({ id: "a1" })])).toBeNull();
  });

  it("returns the chips of the latest call (latest wins)", () => {
    expect(
      latestAgentSuggestions([
        user("u1"),
        suggest("s1", ["Old A"]),
        suggest("s2", ["New A", "New B"]),
      ]),
    ).toEqual(["New A", "New B"]);
  });

  it("hides chips once a user message follows them", () => {
    expect(
      latestAgentSuggestions([user("u1"), suggest("s1", ["A"]), user("u2")]),
    ).toBeNull();
  });

  it("keeps chips visible through trailing assistant text", () => {
    expect(
      latestAgentSuggestions([
        user("u1"),
        suggest("s1", ["A"]),
        msg({ id: "a1", content: "anything else?" }),
      ]),
    ).toEqual(["A"]);
  });

  it("returns null when the latest call's payload is unparseable", () => {
    expect(
      latestAgentSuggestions([
        msg({
          id: "s1",
          variant: "tool",
          toolCall: {
            id: "tc-s1",
            name: SUGGEST_REPLIES_TOOL_NAME,
            status: "complete",
            args: { nope: true },
          },
        }),
      ]),
    ).toBeNull();
  });
});

describe("builtInClientToolsForDispatch - suggest_replies gating", () => {
  it("returns nothing by default (expose is opt-in)", () => {
    expect(builtInClientToolsForDispatch(undefined)).toEqual([]);
    expect(
      builtInClientToolsForDispatch({
        features: { suggestReplies: {} },
      } as AgentWidgetConfig),
    ).toEqual([]);
  });

  it("returns the tool when expose is true", () => {
    expect(
      builtInClientToolsForDispatch({
        features: { suggestReplies: { expose: true } },
      } as AgentWidgetConfig),
    ).toEqual([SUGGEST_REPLIES_CLIENT_TOOL]);
  });

  it("ignores expose when the feature is disabled", () => {
    // Exposing the tool with the feature off would park the execution on a
    // generic tool bubble awaiting a fire-and-forget resume that never comes.
    expect(
      builtInClientToolsForDispatch({
        features: { suggestReplies: { expose: true, enabled: false } },
      } as AgentWidgetConfig),
    ).toEqual([]);
  });

  it("composes with ask_user_question, ask first", () => {
    expect(
      builtInClientToolsForDispatch({
        features: {
          askUserQuestion: { expose: true },
          suggestReplies: { expose: true },
        },
      } as AgentWidgetConfig),
    ).toEqual([ASK_USER_QUESTION_CLIENT_TOOL, SUGGEST_REPLIES_CLIENT_TOOL]);
  });
});

describe("AgentWidgetClient - built-in suggest_replies exposure", () => {
  const captureDispatchBody = () => {
    const captured: { body: string | null } = { body: null };
    global.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, options: { body: string }) => {
        captured.body = options.body;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      });
    return captured;
  };

  const userMessage = () => ({
    id: "u1",
    role: "user" as const,
    content: "hi",
    createdAt: new Date().toISOString(),
  });

  it("ships suggest_replies on clientTools when expose is on", async () => {
    const captured = captureDispatchBody();
    const client = new AgentWidgetClient({
      apiUrl: "http://localhost:8000",
      features: { suggestReplies: { expose: true } },
    });
    await client.dispatch({ messages: [userMessage()] }, () => undefined);
    const parsed = JSON.parse(captured.body!);
    expect(parsed.clientTools).toEqual([SUGGEST_REPLIES_CLIENT_TOOL]);
  });

  it("omits clientTools entirely when expose is off and no WebMCP tools exist", async () => {
    const captured = captureDispatchBody();
    const client = new AgentWidgetClient({
      apiUrl: "http://localhost:8000",
    });
    await client.dispatch({ messages: [userMessage()] }, () => undefined);
    const parsed = JSON.parse(captured.body!);
    expect(parsed.clientTools).toBeUndefined();
  });

  it("changes the clientTools fingerprint when toggled (diff-only resend)", () => {
    const webMcpOnly = [{ name: "search", description: "s" }];
    const withBuiltIn = [SUGGEST_REPLIES_CLIENT_TOOL, ...webMcpOnly];
    expect(computeClientToolsFingerprint(withBuiltIn)).not.toBe(
      computeClientToolsFingerprint(webMcpOnly),
    );
  });
});

describe("AgentWidgetSession - suggest_replies fire-and-forget auto-resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mirrors session.webmcp.test.ts's harness: spy the client's resume/execute
  // seams and stub connectStream so no real network or SSE parsing happens.
  const makeSession = (config?: Partial<AgentWidgetConfig>) => {
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", ...config },
      {
        onMessagesChanged: () => undefined,
        onStatusChanged: () => undefined,
        onStreamingChanged: () => undefined,
      },
    );
    const client = (session as unknown as { client: Record<string, unknown> })
      .client;
    const executeSpy = vi.fn();
    client.executeWebMcpToolCall = executeSpy;
    const resumeSpy = vi.fn(
      async () => new Response(new Blob([""]), { status: 200 }),
    );
    client.resumeFlow = resumeSpy;
    (
      session as unknown as { connectStream: () => Promise<void> }
    ).connectStream = vi.fn(async () => undefined);
    return { session, executeSpy, resumeSpy };
  };

  const suggestAwait = (
    toolCallId: string,
    executionId = "exec-sr",
  ): AgentWidgetMessage => ({
    id: `tool-${toolCallId}`,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    agentMetadata: {
      executionId,
      awaitingLocalTool: true,
      webMcpToolCallId: toolCallId,
    },
    toolCall: {
      id: toolCallId,
      name: SUGGEST_REPLIES_TOOL_NAME,
      status: "complete",
      args: { suggestions: ["Tell me more", "Show pricing"] },
    },
  });

  const webMcpAwait = (
    toolCallId: string,
    executionId = "exec-sr",
  ): AgentWidgetMessage => ({
    id: `tool-${toolCallId}`,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    agentMetadata: {
      executionId,
      awaitingLocalTool: true,
      webMcpToolCallId: toolCallId,
    },
    toolCall: {
      id: toolCallId,
      name: "webmcp:search",
      status: "complete",
      args: { q: "shoes" },
    },
  });

  const feed = (session: AgentWidgetSession, msg: AgentWidgetMessage) =>
    (session as unknown as { handleEvent: (e: unknown) => void }).handleEvent({
      type: "message",
      message: msg,
    });

  const endStream = (session: AgentWidgetSession) =>
    (session as unknown as { handleEvent: (e: unknown) => void }).handleEvent({
      type: "status",
      status: "idle",
    });

  const flushMicrotasks = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  it("auto-POSTs ONE /resume with the canned output after stream idle — no bridge, no WebMCP config", async () => {
    const { session, executeSpy, resumeSpy } = makeSession();

    feed(session, suggestAwait("toolu_S"));
    // Not resolved at step_await receipt — only after the stream ends.
    expect(resumeSpy).not.toHaveBeenCalled();

    endStream(session);
    await flushMicrotasks();

    expect(executeSpy).not.toHaveBeenCalled();
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const [execId, toolOutputs] = resumeSpy.mock.calls[0]! as unknown as [
      string,
      Record<string, { content: { type: string; text: string }[] }>,
    ];
    expect(execId).toBe("exec-sr");
    expect(toolOutputs["toolu_S"]).toEqual({
      content: [{ type: "text", text: "Suggestions shown to the user." }],
    });
  });

  it("marks suggestRepliesResolved and clears awaitingLocalTool on resume OK", async () => {
    const { session } = makeSession();
    feed(session, suggestAwait("toolu_S"));
    endStream(session);
    await flushMicrotasks();

    const stored = (
      session as unknown as { messages: AgentWidgetMessage[] }
    ).messages.find((m) => m.toolCall?.id === "toolu_S");
    expect(stored?.agentMetadata?.suggestRepliesResolved).toBe(true);
    expect(stored?.agentMetadata?.awaitingLocalTool).toBe(false);
    expect(stored?.toolCall?.status).toBe("complete");
  });

  it("dedupes a duplicate step_await re-emit (no double resume)", async () => {
    const { session, resumeSpy } = makeSession();
    feed(session, suggestAwait("toolu_S"));
    feed(session, suggestAwait("toolu_S")); // same-batch duplicate
    endStream(session);
    await flushMicrotasks();
    expect(resumeSpy).toHaveBeenCalledTimes(1);

    // A stale re-emit after resolution must not trigger a second resume.
    feed(session, suggestAwait("toolu_S"));
    endStream(session);
    await flushMicrotasks();
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("joins a parallel webmcp await in ONE batched /resume", async () => {
    const { session, executeSpy, resumeSpy } = makeSession({
      webmcp: { enabled: true },
    });
    executeSpy.mockImplementation(() =>
      Promise.resolve({ content: [{ type: "text", text: "found" }] }),
    );

    feed(session, webMcpAwait("toolu_W"));
    feed(session, suggestAwait("toolu_S"));
    endStream(session);
    await flushMicrotasks();

    // The page tool executed; suggest_replies did not touch the bridge.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const [, toolOutputs] = resumeSpy.mock.calls[0]! as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(toolOutputs).sort()).toEqual(["toolu_S", "toolu_W"]);
  });

  it("does NOT auto-resume when the feature is disabled", async () => {
    const { session, resumeSpy } = makeSession({
      features: { suggestReplies: { enabled: false } },
    });
    feed(session, suggestAwait("toolu_S"));
    endStream(session);
    await flushMicrotasks();
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it("never re-resumes after hydration clears the in-memory dedupe keys (persisted flag wins)", async () => {
    const { session, resumeSpy } = makeSession();
    feed(session, suggestAwait("toolu_S"));
    endStream(session);
    await flushMicrotasks();
    expect(resumeSpy).toHaveBeenCalledTimes(1);

    // Hydration (e.g. storage restore) wipes webMcpInflightKeys /
    // webMcpResolvedKeys — only the suggestRepliesResolved metadata persisted
    // on the message survives to block a replayed step_await.
    const resolved = (
      session as unknown as { messages: AgentWidgetMessage[] }
    ).messages;
    session.hydrateMessages(resolved);
    // Force-clear both dedupe sets so only the persisted flag can block.
    const internals = session as unknown as {
      webMcpInflightKeys: Set<string>;
      webMcpResolvedKeys: Set<string>;
    };
    internals.webMcpInflightKeys.clear();
    internals.webMcpResolvedKeys.clear();

    feed(session, suggestAwait("toolu_S"));
    endStream(session);
    await flushMicrotasks();
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });
});
