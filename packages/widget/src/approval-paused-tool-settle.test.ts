import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import { AgentWidgetSession } from "./session";
import type { AgentWidgetMessage } from "./types";

// Older servers resume an approval by re-running the agent, which re-issues the
// gated call under a NEW toolCallId, so no terminal frame arrives for the paused
// one; the session settles it when the stream ends. Current servers run the
// paused call itself under its original id, and that real result wins.

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const sse = (events: Array<Record<string, unknown>>) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });

const liveSession = (client: AgentWidgetClient) => {
  (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
    sessionId: "cs_123",
    expiresAt: new Date(Date.now() + 60_000),
  };
};

const pausedTool = (status: "running" | "complete" = "running"): AgentWidgetMessage => ({
  id: "tool-toolu_paused",
  role: "assistant",
  content: "",
  createdAt: new Date(Date.now() - 2_000).toISOString(),
  streaming: status === "running",
  variant: "tool",
  toolCall: {
    id: "toolu_paused",
    name: "place_pickup_order",
    status,
    args: { item: "latte" },
    startedAt: Date.now() - 2_000,
  },
});

const pendingApproval = (toolCallId?: string): AgentWidgetMessage => ({
  id: "approval-appr_1",
  role: "assistant",
  content: "",
  createdAt: new Date(Date.now() - 1_000).toISOString(),
  variant: "approval",
  approval: {
    id: "appr_1",
    status: "pending",
    agentId: "agent_abc",
    executionId: "exec_abc",
    toolName: "place_pickup_order",
    description: "Place the order",
    ...(toolCallId ? { toolCallId } : {}),
  },
});

const setup = (initialMessages: AgentWidgetMessage[]) => {
  let messages: AgentWidgetMessage[] = [];
  const toolStates: Array<AgentWidgetMessage["toolCall"]> = [];
  const session = new AgentWidgetSession(
    { clientToken: "ct_live_demo", apiUrl: "https://api.runtype.com", initialMessages },
    {
      onMessagesChanged: (m) => {
        messages = m;
        toolStates.push(m.find((x) => x.toolCall?.id === "toolu_paused")?.toolCall);
      },
      onStatusChanged: () => {},
      onStreamingChanged: () => {},
      onError: () => {},
    }
  );
  liveSession((session as unknown as { client: AgentWidgetClient }).client);
  const approval = initialMessages.find((m) => m.variant === "approval")!.approval!;
  return {
    resolve: (decision: "approved" | "denied") => session.resolveApproval(approval, decision),
    tool: (id = "toolu_paused") => messages.find((m) => m.toolCall?.id === id),
    toolStates,
  };
};

const resumeStream = (decision: "approved" | "denied" | "timeout", rerun = true) =>
  sse([
    { type: "approval_complete", executionId: "exec_abc", approvalId: "appr_1", decision },
    ...(rerun
      ? [
          { type: "tool_start", toolCallId: "toolu_rerun", toolName: "place_pickup_order", toolType: "custom" },
          {
            type: "tool_complete",
            toolCallId: "toolu_rerun",
            toolName: "place_pickup_order",
            success: decision === "approved",
            result: decision === "approved" ? { orderId: "ord_1" } : undefined,
          },
        ]
      : []),
    { type: "execution_complete", kind: "agent", success: true },
  ]);

describe("approval_start records the paused toolCallId", () => {
  it("carries toolCallId onto the approval message", async () => {
    const client = new AgentWidgetClient({ clientToken: "ct_live_demo", apiUrl: "https://api.runtype.com" });
    const emitted: AgentWidgetMessage[] = [];
    await client.processStream(
      sse([
        {
          type: "approval_start",
          executionId: "exec_abc",
          approvalId: "appr_1",
          toolCallId: "toolu_paused",
          toolName: "place_pickup_order",
          parameters: { item: "latte" },
        },
      ]).body!,
      (event) => {
        if (event.type === "message") emitted.push(event.message);
      }
    );
    const approvalMessage = emitted.find((m) => m.variant === "approval");
    expect(approvalMessage?.approval?.toolCallId).toBe("toolu_paused");
  });
});

describe("AgentWidgetSession settles the approval-paused tool bubble", () => {
  it("marks an approved call superseded and leaves the result on the re-run", async () => {
    global.fetch = vi.fn().mockResolvedValue(resumeStream("approved"));
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("approved");

    expect(tool()?.toolCall).toMatchObject({
      status: "complete",
      approvalStatus: "approved",
      superseded: true,
    });
    expect(tool()?.toolCall?.success).toBeUndefined();
    expect(tool()?.streaming).toBe(false);
    expect(tool("toolu_rerun")?.toolCall).toMatchObject({
      status: "complete",
      result: { orderId: "ord_1" },
    });
  });

  it("settles a denied call as failed with a Denied error", async () => {
    global.fetch = vi.fn().mockResolvedValue(resumeStream("denied", false));
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("denied");

    expect(tool()?.toolCall).toMatchObject({
      status: "complete",
      approvalStatus: "denied",
      success: false,
      error: "Denied",
    });
    expect(tool()?.toolCall?.superseded).toBeUndefined();
  });

  it("settles a timed-out call as failed", async () => {
    global.fetch = vi.fn().mockResolvedValue(resumeStream("timeout", false));
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("denied");

    expect(tool()?.toolCall).toMatchObject({
      status: "complete",
      approvalStatus: "timeout",
      success: false,
      error: "Approval timed out",
    });
  });

  it("leaves the bubble running when the server refuses the decision", async () => {
    global.fetch = vi.fn().mockResolvedValue(Response.json({ error: "Failed to process approval" }, { status: 500 }));
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("approved").catch(() => {});

    expect(tool()?.toolCall?.status).toBe("running");
    expect(tool()?.toolCall?.approvalStatus).toBeUndefined();
  });

  it("settles the call as timed out when the server reports the pause gone", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      Response.json({ code: "APPROVAL_ALREADY_RESOLVED", message: "Already resolved" }, { status: 409 })
    );
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("approved").catch(() => {});

    expect(tool()?.toolCall).toMatchObject({
      status: "complete",
      approvalStatus: "timeout",
      success: false,
      error: "Approval timed out",
    });
  });

  it("lets the server's own result for the paused id complete an approved call", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      sse([
        { type: "approval_complete", executionId: "exec_abc", approvalId: "appr_1", decision: "approved" },
        { type: "tool_start", toolCallId: "toolu_paused", toolName: "place_pickup_order", toolType: "custom" },
        {
          type: "tool_complete",
          toolCallId: "toolu_paused",
          toolName: "place_pickup_order",
          success: true,
          result: { orderId: "ord_1" },
        },
        { type: "execution_complete", kind: "agent", success: true },
      ])
    );
    const { resolve, tool, toolStates } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("approved");

    expect(tool()?.toolCall).toMatchObject({ status: "complete", result: { orderId: "ord_1" } });
    expect(toolStates.some((state) => state?.superseded)).toBe(false);
  });

  it("lets the server's own failed result for the paused id complete a denied call", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      sse([
        { type: "approval_complete", executionId: "exec_abc", approvalId: "appr_1", decision: "denied" },
        { type: "tool_start", toolCallId: "toolu_paused", toolName: "place_pickup_order", toolType: "custom" },
        {
          type: "tool_complete",
          toolCallId: "toolu_paused",
          toolName: "place_pickup_order",
          success: false,
          error: 'Tool "place_pickup_order" was denied by the user.',
        },
        { type: "execution_complete", kind: "agent", success: true },
      ])
    );
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("denied");

    expect(tool()?.toolCall).toMatchObject({ status: "complete", success: false });
    expect(tool()?.toolCall?.error).toContain("denied by the user");
  });

  it("does not touch a tool call that already completed", async () => {
    global.fetch = vi.fn().mockResolvedValue(resumeStream("denied", false));
    const { resolve, tool } = setup([pausedTool("complete"), pendingApproval("toolu_paused")]);
    await resolve("denied");

    expect(tool()?.toolCall?.success).toBeUndefined();
    expect(tool()?.toolCall?.approvalStatus).toBeUndefined();
  });

  it("does nothing for an approval without a toolCallId", async () => {
    global.fetch = vi.fn().mockResolvedValue(resumeStream("denied", false));
    const { resolve, tool } = setup([pausedTool(), pendingApproval()]);
    await resolve("denied");

    expect(tool()?.toolCall?.status).toBe("running");
  });

  it("settles a denied call when the accepted denial has no stream body", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const { resolve, tool } = setup([pausedTool(), pendingApproval("toolu_paused")]);
    await resolve("denied");

    expect(tool()?.toolCall).toMatchObject({
      status: "complete",
      approvalStatus: "denied",
      success: false,
      error: "Denied",
    });
  });
});

describe("approval settles stay with the stream that decided them", () => {
  const tool = (id: string): AgentWidgetMessage => ({
    ...pausedTool(),
    id: `tool-${id}`,
    toolCall: { ...pausedTool().toolCall!, id },
  });
  const approval = (approvalId: string, toolCallId: string): AgentWidgetMessage => ({
    ...pendingApproval(toolCallId),
    id: `approval-${approvalId}`,
    approval: { ...pendingApproval(toolCallId).approval!, id: approvalId, toolCallId },
  });
  const frame = (event: Record<string, unknown>) =>
    new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

  it("does not settle another stream's paused call when one stream ends", async () => {
    let messages: AgentWidgetMessage[] = [];
    const session = new AgentWidgetSession(
      {
        clientToken: "ct_live_demo",
        apiUrl: "https://api.runtype.com",
        initialMessages: [tool("toolu_a"), approval("appr_a", "toolu_a"), tool("toolu_b"), approval("appr_b", "toolu_b")],
      },
      {
        onMessagesChanged: (m) => { messages = m; },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onError: () => {},
      }
    );
    let controlB!: ReadableStreamDefaultController<Uint8Array>;
    const streamB = new ReadableStream<Uint8Array>({ start: (c) => { controlB = c; } });
    const connectedB = session.connectStream(streamB, { allowReentry: true });
    controlB.enqueue(frame({ type: "approval_complete", executionId: "exec_b", approvalId: "appr_b", decision: "approved" }));
    await new Promise((r) => setTimeout(r, 0));

    await session.connectStream(
      sse([
        { type: "approval_complete", executionId: "exec_a", approvalId: "appr_a", decision: "approved" },
        { type: "execution_complete", kind: "agent", success: true },
      ]).body!,
      { allowReentry: true }
    );
    const b = () => messages.find((m) => m.toolCall?.id === "toolu_b")?.toolCall;
    expect(b()?.superseded).toBeUndefined();

    controlB.enqueue(frame({ type: "tool_start", toolCallId: "toolu_b", toolName: "place_pickup_order", toolType: "custom" }));
    controlB.enqueue(frame({ type: "tool_complete", toolCallId: "toolu_b", toolName: "place_pickup_order", success: true, result: { orderId: "ord_b" } }));
    controlB.close();
    await connectedB;
    expect(b()).toMatchObject({ status: "complete", result: { orderId: "ord_b" } });
    expect(b()?.superseded).toBeUndefined();
  });
});
