import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import { AgentWidgetSession } from "./session";
import type { AgentWidgetMessage } from "./types";

// runtypelabs/core#9518: client-token embeds answer `approver: 'end-user'`
// gates through the session-authenticated `/v1/client/approve`.

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const approval = { agentId: "agent_abc", executionId: "exec_abc", approvalId: "appr_1" };

const liveSession = (client: AgentWidgetClient) => {
  // A live session so initSession() short-circuits instead of fetching /init.
  (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
    sessionId: "cs_123",
    expiresAt: new Date(Date.now() + 60_000),
  };
};

const sse = (events: Array<Record<string, unknown>>) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

const mockFetch = (...responses: Response[]) => {
  const calls: Call[] = [];
  global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(init.body as string),
      headers: init.headers as Record<string, string>,
    });
    return responses.shift() ?? sse([]);
  });
  return calls;
};

const tokenClient = () => {
  const client = new AgentWidgetClient({ clientToken: "ct_live_demo", apiUrl: "https://api.runtype.com" });
  liveSession(client);
  return client;
};

describe("AgentWidgetClient.resolveApproval", () => {
  it("posts a client-token decision to /v1/client/approve with the session and no Bearer key", async () => {
    const calls = mockFetch(sse([]));
    await tokenClient().resolveApproval(approval, "approved");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.runtype.com/v1/client/approve");
    expect(calls[0].body).toEqual({
      sessionId: "cs_123",
      executionId: "exec_abc",
      approvalId: "appr_1",
      decision: "approved",
      streamResponse: true,
    });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it("sends a denial the same way", async () => {
    const calls = mockFetch(sse([]));
    await tokenClient().resolveApproval(approval, "denied");

    expect(calls[0].url).toBe("https://api.runtype.com/v1/client/approve");
    expect(calls[0].body.decision).toBe("denied");
  });

  it("falls back to the owner route when the core predates /v1/client/approve", async () => {
    const calls = mockFetch(
      Response.json({ error: "Not Found", message: "The requested resource was not found" }, { status: 404 }),
      sse([])
    );
    const response = await tokenClient().resolveApproval(approval, "approved");

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.runtype.com/v1/client/approve",
      "https://api.runtype.com/v1/agents/agent_abc/approve",
    ]);
    expect(calls[1].body.sessionId).toBeUndefined();
    expect(response.ok).toBe(true);
  });

  it("returns an unknown or expired pause 404 without falling back", async () => {
    const calls = mockFetch(
      Response.json({ error: "No paused execution found for this executionId" }, { status: 404 })
    );
    const response = await tokenClient().resolveApproval(approval, "approved");

    expect(calls).toHaveLength(1);
    expect(response.status).toBe(404);
  });

  it("keeps proxy mode on the owner route with the host headers", async () => {
    const calls = mockFetch(sse([]));
    const client = new AgentWidgetClient({
      apiUrl: "https://api.runtype.com/v1/dispatch",
      headers: { Authorization: "Bearer host" },
    });
    await client.resolveApproval(approval, "approved");

    expect(calls[0].url).toBe("https://api.runtype.com/v1/agents/agent_abc/approve");
    expect(calls[0].body).toEqual({
      executionId: "exec_abc",
      approvalId: "appr_1",
      decision: "approved",
      streamResponse: true,
    });
    expect(calls[0].headers.Authorization).toBe("Bearer host");
  });
});

describe("AgentWidgetSession.resolveApproval in client-token mode", () => {
  const setup = () => {
    let messages: AgentWidgetMessage[] = [];
    const errors: Error[] = [];
    const pending: AgentWidgetMessage = {
      id: "approval-appr_1",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      variant: "approval",
      approval: {
        id: "appr_1",
        status: "pending",
        agentId: "agent_abc",
        executionId: "exec_abc",
        toolName: "place_pickup_order",
        description: "Place the order",
      },
    };
    const session = new AgentWidgetSession(
      { clientToken: "ct_live_demo", apiUrl: "https://api.runtype.com", initialMessages: [pending] },
      {
        onMessagesChanged: (m) => { messages = m; },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onError: (e) => errors.push(e),
      }
    );
    liveSession((session as unknown as { client: AgentWidgetClient }).client);
    return {
      session,
      errors,
      approve: (decision: "approved" | "denied" = "approved") =>
        session.resolveApproval(pending.approval!, decision),
      bubble: () => messages.find((m) => m.id === "approval-appr_1"),
      last: () => messages.at(-1),
    };
  };

  it("streams the approved continuation into the conversation", async () => {
    mockFetch(
      sse([
        { type: "approval_complete", executionId: "exec_abc", approvalId: "appr_1", decision: "approved" },
        { type: "text_start", id: "t1" },
        { type: "text_delta", id: "t1", delta: "Order placed." },
        { type: "text_complete", id: "t1" },
        { type: "execution_complete", kind: "agent", success: true },
      ])
    );
    const { session, errors, approve, bubble, last } = setup();
    await approve();

    expect(bubble()?.approval?.status).toBe("approved");
    expect(last()?.content).toBe("Order placed.");
    expect(session.isStreaming()).toBe(false);
    expect(errors).toEqual([]);
  });

  it.each([
    [
      403,
      {
        error: "This approval needs the business owner, not the chat visitor",
        code: "APPROVAL_APPROVER_NOT_END_USER",
      },
      "This approval needs the business owner, not the chat visitor",
      "approved",
    ],
    [
      409,
      {
        error: "Approval already resolved",
        message: "This approval was already denied; that decision is the one in force.",
        code: "APPROVAL_ALREADY_RESOLVED",
      },
      "This approval was already denied; that decision is the one in force.",
      "approved",
    ],
    [
      404,
      { error: "No paused execution found for this executionId" },
      "No paused execution found for this executionId",
      "timeout",
    ],
  ])("surfaces a %i refusal next to a settled card", async (status, body, text, badge) => {
    mockFetch(Response.json(body, { status }));
    const { session, errors, approve, bubble, last } = setup();
    await approve();

    expect(bubble()?.approval?.status).toBe(badge);
    expect(last()).toMatchObject({ id: "approval-error-appr_1", content: text });
    expect(session.isStreaming()).toBe(false);
    expect(errors.map((e) => e.message)).toEqual([text]);
  });
});
