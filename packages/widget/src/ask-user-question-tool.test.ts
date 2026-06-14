import { describe, it, expect, vi } from "vitest";
import {
  ASK_USER_QUESTION_CLIENT_TOOL,
  ASK_USER_QUESTION_PARAMETERS_SCHEMA,
  builtInClientToolsForDispatch,
} from "./ask-user-question-tool";
import {
  ASK_USER_QUESTION_MAX,
  ASK_USER_QUESTION_TOOL_NAME,
} from "./components/ask-user-question-bubble";
import { AgentWidgetClient } from "./client";
import { computeClientToolsFingerprint } from "./webmcp-bridge";
import type { AgentWidgetConfig } from "./types";

describe("ASK_USER_QUESTION_CLIENT_TOOL definition", () => {
  it("matches the renderer's tool name and origin/annotation contract", () => {
    expect(ASK_USER_QUESTION_CLIENT_TOOL.name).toBe(ASK_USER_QUESTION_TOOL_NAME);
    // `'sdk'` keeps the bare name on the wire (the server only prefixes
    // `origin: 'webmcp'` tools) so the step_await routes to the answer sheet,
    // not the WebMCP bridge. `'local'` is NOT a valid server-side origin.
    expect(ASK_USER_QUESTION_CLIENT_TOOL.origin).toBe("sdk");
    expect(ASK_USER_QUESTION_CLIENT_TOOL.annotations?.readOnlyHint).toBe(true);
  });

  it("bounds questions to the renderer cap and options to 2-4", () => {
    const questions = ASK_USER_QUESTION_PARAMETERS_SCHEMA.properties.questions;
    expect(questions.minItems).toBe(1);
    expect(questions.maxItems).toBe(ASK_USER_QUESTION_MAX);
    const options = questions.items.properties.options;
    expect(options.minItems).toBe(2);
    expect(options.maxItems).toBe(4);
    expect(questions.items.required).toEqual(["question", "options"]);
  });
});

describe("builtInClientToolsForDispatch", () => {
  it("returns nothing by default (expose is opt-in)", () => {
    expect(builtInClientToolsForDispatch(undefined)).toEqual([]);
    expect(builtInClientToolsForDispatch({} as AgentWidgetConfig)).toEqual([]);
    expect(
      builtInClientToolsForDispatch({
        features: { askUserQuestion: {} },
      } as AgentWidgetConfig)
    ).toEqual([]);
  });

  it("returns the tool when expose is true", () => {
    expect(
      builtInClientToolsForDispatch({
        features: { askUserQuestion: { expose: true } },
      } as AgentWidgetConfig)
    ).toEqual([ASK_USER_QUESTION_CLIENT_TOOL]);
  });

  it("ignores expose when the answer sheet is disabled", () => {
    // Offering the agent a question tool the widget can't render an answer
    // UI for would park the execution on a generic tool bubble forever.
    expect(
      builtInClientToolsForDispatch({
        features: { askUserQuestion: { expose: true, enabled: false } },
      } as AgentWidgetConfig)
    ).toEqual([]);
  });
});

describe("AgentWidgetClient - built-in ask_user_question exposure", () => {
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

  it("ships ask_user_question on clientTools when expose is on (no WebMCP)", async () => {
    const captured = captureDispatchBody();
    const client = new AgentWidgetClient({
      apiUrl: "http://localhost:8000",
      features: { askUserQuestion: { expose: true } },
    });
    await client.dispatch({ messages: [userMessage()] }, () => undefined);
    const parsed = JSON.parse(captured.body!);
    expect(parsed.clientTools).toEqual([ASK_USER_QUESTION_CLIENT_TOOL]);
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

  it("leads the WebMCP snapshot when both are present", async () => {
    const captured = captureDispatchBody();
    const client = new AgentWidgetClient({
      apiUrl: "http://localhost:8000",
      features: { askUserQuestion: { expose: true } },
    });
    (
      client as unknown as {
        webMcpBridge: { snapshotForDispatch: () => unknown[] } | null;
      }
    ).webMcpBridge = {
      snapshotForDispatch: () => [
        { name: "search", description: "s", origin: "webmcp" },
      ],
    };
    await client.dispatch({ messages: [userMessage()] }, () => undefined);
    const parsed = JSON.parse(captured.body!);
    expect(parsed.clientTools).toEqual([
      ASK_USER_QUESTION_CLIENT_TOOL,
      { name: "search", description: "s", origin: "webmcp" },
    ]);
  });

  it("changes the clientTools fingerprint when toggled (diff-only resend)", () => {
    // In client-token mode the widget only resends the full clientTools[]
    // when the fingerprint changes: toggling expose must change it so the
    // server actually learns about (or forgets) the built-in tool.
    const webMcpOnly = [{ name: "search", description: "s" }];
    const withBuiltIn = [ASK_USER_QUESTION_CLIENT_TOOL, ...webMcpOnly];
    expect(computeClientToolsFingerprint(withBuiltIn)).not.toBe(
      computeClientToolsFingerprint(webMcpOnly)
    );
  });
});
