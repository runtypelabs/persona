import { describe, expect, it, vi } from "vitest";
import { AgentWidgetSession, type AgentWidgetSessionStatus } from "./session";
import type { AgentWidgetConfig, AgentWidgetRunFinishedEvent } from "./types";

function response(frames: Record<string, unknown>[]) {
  return new Response(frames.map((frame, seq) =>
    `id: ${seq}\nevent: ${frame.type}\ndata: ${JSON.stringify({ executionId: "exec_failed", seq, ...frame })}\n\n`
  ).join(""), { headers: { "Content-Type": "text/event-stream" } });
}

const failureCases: [string, Record<string, unknown>, AgentWidgetConfig["parseSSEEvent"]?][] = [
  ["native execution error", { type: "execution_error", kind: "agent", error: "Model unavailable" }],
  ["custom parser error", { type: "execution_error", kind: "agent", error: "Model unavailable" },
    (data) => (data as { type?: string }).type === "execution_error" ? { error: "Model unavailable" } : null],
  ["nonrecoverable error", { type: "error", error: "Model unavailable", recoverable: false }],
  ["failed step", { type: "step_complete", stepId: "prompt", stepType: "prompt", success: false, error: "Model unavailable" }],
  ["failed completion", { type: "execution_complete", kind: "agent", success: false }],
  ["failed completion with detail", { type: "execution_complete", kind: "agent", success: false, error: "Model unavailable" }],
  ["failed completion with structured detail", { type: "execution_complete", kind: "agent", success: false, error: { message: "Model unavailable" } }],
];

describe("execution failure connection status", () => {
  it.each(failureCases)("keeps connectivity idle and run outcome failed after %s", async (_name, terminal, parseSSEEvent) => {
    const statuses: AgentWidgetSessionStatus[] = [];
    const errors: Error[] = [];
    const outcomes: AgentWidgetRunFinishedEvent[] = [];
    const reconnectStream = vi.fn();
    const onExecutionState = vi.fn();
    const session = new AgentWidgetSession({
      apiUrl: "https://example.test/chat", parseSSEEvent, reconnectStream, onExecutionState,
      customFetch: async () => response([
        { type: "text_delta", id: "text_1", delta: "Partial answer" },
        { type: "text_complete", id: "text_1", text: "Partial answer" },
        terminal,
      ]),
    }, {
      onMessagesChanged: () => {},
      onStatusChanged: status => statuses.push(status),
      onStreamingChanged: () => {},
      onError: error => errors.push(error),
      onRunFinished: event => outcomes.push(event),
    });

    await session.sendMessage("Hello");
    await vi.waitFor(() => expect(outcomes).toHaveLength(1));

    expect(statuses).not.toContain("error");
    expect(session.getStatus()).toBe("idle");
    expect(session.isStreaming()).toBe(false);
    expect(session.getAgentExecution()?.status).toBe("error");
    expect(outcomes[0].outcome).toBe("error");
    const errorRows = session.getMessages().filter(message => message.dispatchError);
    expect(errorRows).toHaveLength(1);
    expect(errorRows[0]).toMatchObject({ localOnly: true });
    expect(errorRows[0].content).toContain("This run failed");
    if (terminal.error) expect(errorRows[0].content).toContain("Model unavailable");
    expect(session.getMessages().some(message => message.content === "Partial answer")).toBe(true);
    expect(reconnectStream).not.toHaveBeenCalled();
    expect(onExecutionState).toHaveBeenLastCalledWith(null);
    if (terminal.type !== "execution_complete") {
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Model unavailable");
    }
    session.destroy();
  });

  it.each(failureCases)("leaves failure rendering to the host after %s", async (_name, terminal, parseSSEEvent) => {
    const errors = vi.fn();
    const session = new AgentWidgetSession({
      apiUrl: "https://example.test/chat", parseSSEEvent, executionErrorDisplay: "host",
    }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {}, onError: errors,
    });
    await session.connectStream(response([terminal]).body!);
    expect(session.getMessages().filter(message => message.dispatchError)).toEqual([]);
    expect(session.getStatus()).toBe("idle");
    if (terminal.type !== "execution_complete") expect(errors).toHaveBeenCalledOnce();
    session.destroy();
  });

  it.each(["Custom failure message", ""])("honors the errorMessage override (%j)", async (errorMessage) => {
    const session = new AgentWidgetSession({ apiUrl: "https://example.test/chat", errorMessage }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
    });
    await session.connectStream(response([failureCases[0][1]]).body!);
    expect(session.getMessages().map(message => message.content)).toEqual(errorMessage ? [errorMessage] : []);
    session.destroy();
  });

  it("renders one local failure row for repeated terminal notifications", async () => {
    const session = new AgentWidgetSession({ apiUrl: "https://example.test/chat" }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
    });
    await session.connectStream(response([
      failureCases[0][1], { type: "execution_complete", kind: "agent", success: false },
    ]).body!);
    const rows = session.getMessages().filter(message => message.dispatchError);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain("Model unavailable");
    session.destroy();
  });

  it("shows a meaningful fallback when completion failure detail is empty", async () => {
    const session = new AgentWidgetSession({ apiUrl: "https://example.test/chat" }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
    });
    await session.connectStream(response([
      { type: "execution_complete", kind: "agent", success: false, error: "" },
    ]).body!);
    expect(session.getMessages().at(-1)?.content).toContain("Execution error");
    session.destroy();
  });

  it("resets failure deduplication for the next run and excludes error rows from model input", async () => {
    const payloads: unknown[] = [];
    const outcomes: AgentWidgetRunFinishedEvent[] = [];
    const session = new AgentWidgetSession({
      apiUrl: "https://example.test/chat", customFetch: async (_url, _init, payload) => {
        payloads.push(payload.messages);
        return response([failureCases[0][1]]);
      },
    }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
      onRunFinished: event => outcomes.push(event),
    });
    await session.sendMessage("First attempt");
    await vi.waitFor(() => expect(outcomes).toHaveLength(1));
    await session.sendMessage("Try again");
    await vi.waitFor(() => expect(outcomes).toHaveLength(2));
    expect(outcomes.map(event => event.outcome)).toEqual(["error", "error"]);
    expect(session.getMessages().filter(message => message.dispatchError)).toHaveLength(2);
    expect(JSON.stringify(payloads[1])).not.toContain("This run failed");
    expect(JSON.stringify(payloads[1])).toContain("Try again");
    session.destroy();
  });

  it("keeps a real stream read failure visible as a connection error", async () => {
    const failure = new TypeError("Failed to fetch");
    const errors: Error[] = [];
    const session = new AgentWidgetSession({ apiUrl: "https://example.test/chat" }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
      onError: error => errors.push(error),
    });
    await session.connectStream(new ReadableStream({ start(controller) { controller.error(failure); } }));
    expect(session.getStatus()).toBe("error");
    expect(errors).toEqual([failure]);
    session.destroy();
  });

  it.each([undefined, true])("leaves recoverable notices streaming until a successful completion (recoverable=%s)", async (recoverable) => {
    const errors = vi.fn();
    const outcomes: AgentWidgetRunFinishedEvent[] = [];
    const session = new AgentWidgetSession({
      apiUrl: "https://example.test/chat", customFetch: async () => response([
        { type: "error", error: "Retrying", recoverable },
        { type: "execution_complete", kind: "agent", success: true },
      ]),
    }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
      onError: errors, onRunFinished: event => outcomes.push(event),
    });
    await session.sendMessage("Hello");
    await vi.waitFor(() => expect(outcomes).toHaveLength(1));
    expect(session.getStatus()).toBe("idle");
    expect(outcomes[0].outcome).toBe("success");
    expect(errors).not.toHaveBeenCalled();
    session.destroy();
  });
});
