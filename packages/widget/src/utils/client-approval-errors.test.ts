import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "../client";
import { AgentWidgetSession } from "../session";
import type { AgentWidgetMessage } from "../types";
import {
  ClientApprovalError,
  clientApprovalErrorFromResponse,
} from "./client-approval-errors";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const sseResponse = (events: Array<Record<string, unknown>>) =>
  new Response(
    events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  );

type SessionInternals = {
  clientSession: {
    sessionId: string;
    expiresAt: Date;
    durableRecovery?: { enabled: boolean };
  };
  readVisitorToken?: () => Promise<string>;
};

const withLiveSession = (client: AgentWidgetClient, durable = false) => {
  const internals = client as unknown as SessionInternals;
  internals.clientSession = {
    sessionId: "cs_123",
    expiresAt: new Date(Date.now() + 60_000),
    ...(durable ? { durableRecovery: { enabled: true } } : {}),
  };
  return internals;
};

const approvalRef = {
  agentId: "agent_abc",
  executionId: "exec_abc",
  approvalId: "apr_1",
};

describe("AgentWidgetClient.resolveApproval (client-token)", () => {
  it("posts the decision to /v1/client/approve with the session and no Bearer key", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      capturedHeaders = init.headers as Record<string, string>;
      return sseResponse([]);
    });

    const client = new AgentWidgetClient({
      clientToken: "ct_live_demo",
      apiUrl: "https://api.runtype.com/v1/dispatch",
    });
    const internals = withLiveSession(client, true);
    internals.readVisitorToken = async () => "cvt_1";

    await client.resolveApproval(approvalRef, "approved", { assistantMessageId: "ast_1" });

    expect(capturedUrl).toBe("https://api.runtype.com/v1/client/approve");
    expect(capturedBody).toEqual({
      sessionId: "cs_123",
      executionId: "exec_abc",
      approvalId: "apr_1",
      decision: "approved",
      streamResponse: true,
      assistantMessageId: "ast_1",
    });
    expect(capturedBody).not.toHaveProperty("remember");
    expect(capturedHeaders!["Authorization"]).toBeUndefined();
    expect(capturedHeaders!["X-Visitor-Token"]).toBe("cvt_1");
  });

  it("keeps the agent approve route outside client-token mode", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      return sseResponse([]);
    });

    const client = new AgentWidgetClient({ apiUrl: "https://api.runtype.com/v1/dispatch" });
    await client.resolveApproval(approvalRef, "denied");

    expect(capturedUrl).toBe("https://api.runtype.com/v1/agents/agent_abc/approve");
    expect(capturedBody).toEqual({
      executionId: "exec_abc",
      approvalId: "apr_1",
      decision: "denied",
      streamResponse: true,
    });
  });
});

describe("clientApprovalErrorFromResponse", () => {
  it.each([
    [jsonResponse(409, { error: "APPROVAL_ALREADY_RESOLVED" }), "alreadyResolved", "This request was already answered."],
    [jsonResponse(404, { error: "No paused execution" }), "expired", "This request expired before your answer arrived."],
    [new Response("404 Not Found", { status: 404 }), "unsupported", "This chat can't accept approvals yet."],
    [
      jsonResponse(403, { error: "Not allowed", code: "APPROVAL_APPROVER_NOT_END_USER" }),
      "requiresOwner",
      "This action needs the business's approval, so it can't be approved from the chat.",
    ],
    [jsonResponse(403, { error: "Origin not allowed" }), "forbidden", "This request can't be answered from this chat."],
    [jsonResponse(401, { error: "Session expired" }), "sessionExpired", "Your chat session expired. Refresh the page and try again."],
    [jsonResponse(503, { error: "Unavailable" }), "unavailable", "The assistant is unavailable right now. Please try again later."],
    [jsonResponse(400, { error: "Invalid body" }), "failed", "Your answer couldn't be sent. Please try again."],
  ])("maps %#", async (response, reason, copy) => {
    const error = await clientApprovalErrorFromResponse(response);
    expect(error).toBeInstanceOf(ClientApprovalError);
    expect(error.reason).toBe(reason);
    expect(error.visitorMessage).toBe(copy);
  });

  it("recognizes the owner-approval code when it arrives as the error field", async () => {
    const error = await clientApprovalErrorFromResponse(
      jsonResponse(403, { error: "APPROVAL_APPROVER_NOT_END_USER" })
    );
    expect(error.reason).toBe("requiresOwner");
  });
});

describe("AgentWidgetSession.resolveApproval (client-token)", () => {
  const approval = {
    id: "apr_1",
    status: "pending" as const,
    agentId: "agent_abc",
    executionId: "exec_abc",
    toolName: "place_pickup_order",
    description: "Place an order",
  };

  const makeSession = () => {
    let messages: AgentWidgetMessage[] = [];
    const errors: Error[] = [];
    const session = new AgentWidgetSession(
      {
        clientToken: "ct_live_demo",
        apiUrl: "https://api.runtype.com",
        initialMessages: [
          {
            id: `approval-${approval.id}`,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            variant: "approval",
            approval,
          },
        ],
      },
      {
        onMessagesChanged: (m) => { messages = m; },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onError: (e) => errors.push(e),
      }
    );
    withLiveSession((session as unknown as { client: AgentWidgetClient }).client);
    return { session, errors, messages: () => messages };
  };

  it("streams the continuation into the assistant message id it sent", async () => {
    let sentId: unknown;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      sentId = JSON.parse(init.body as string).assistantMessageId;
      return sseResponse([]);
    });
    const { session } = makeSession();
    const connect = vi.spyOn(session, "connectStream").mockResolvedValue(undefined);

    await session.resolveApproval(approval, "approved", { remember: true });

    expect(typeof sentId).toBe("string");
    expect(connect).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.objectContaining({ assistantMessageId: sentId })
    );
  });

  it("shows an expired approval in the transcript and marks the card timed out", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(404, { error: "Approval expired" }));
    const { session, errors, messages } = makeSession();

    await session.resolveApproval(approval, "approved");

    const card = messages().find((m) => m.id === `approval-${approval.id}`);
    expect(card?.approval?.status).toBe("timeout");
    expect(messages().at(-1)?.content).toBe("This request expired before your answer arrived.");
    expect(errors).toHaveLength(1);
    expect(session.isStreaming()).toBe(false);
  });

  it("reopens the card for a retry after a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { session, messages } = makeSession();

    await session.resolveApproval(approval, "approved");

    const card = messages().find((m) => m.id === `approval-${approval.id}`);
    expect(card?.approval?.status).toBe("pending");
    expect(messages().at(-1)?.content).toBe("Your answer couldn't be sent. Please try again.");
  });

  it("reports an unsupported server instead of retrying another route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("404 Not Found", { status: 404 }));
    global.fetch = fetchMock;
    const { session, messages } = makeSession();

    await session.resolveApproval(approval, "approved");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(messages().at(-1)?.content).toBe("This chat can't accept approvals yet.");
  });
});
