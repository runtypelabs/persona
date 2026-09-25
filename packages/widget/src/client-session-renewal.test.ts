import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, ClientSession } from "./types";
import { createVisitorStore } from "./utils/visitor-store";

const message = {
  id: "user-1",
  role: "user" as const,
  content: "continue",
  createdAt: "2026-09-22T00:00:00Z",
};
const options = { messages: [message], assistantMessageId: "assistant-1" };
const session = (milliseconds = 600_000): ClientSession => ({
  sessionId: "session-old",
  conversationId: "conversation-owned",
  expiresAt: new Date(Date.now() + milliseconds),
  durableRecovery: { enabled: true },
  flow: { id: "agent-1", name: "Agent", description: null },
  config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
});
const expired = () =>
  Response.json({ error: "Session not found or expired" }, { status: 401 });
const success = () =>
  new Response('data: {"type":"done"}\n\n', {
    headers: { "Content-Type": "text/event-stream" },
  });

async function setup(milliseconds = 600_000) {
  const onSessionInit = vi.fn();
  const onSessionExpired = vi.fn();
  const setStoredSessionId = vi.fn();
  const store = createVisitorStore("ct_test_renewal", "renewal-", true);
  await store.set("cvt_owned");
  const client = new AgentWidgetClient({
    clientToken: "ct_test_renewal",
    apiUrl: "https://example.com",
    onSessionInit,
    onSessionExpired,
    setStoredSessionId,
  });
  client.setHistoryInternals({ visitorStore: store });
  (client as unknown as { clientSession: ClientSession }).clientSession =
    session(milliseconds);
  const requests: Array<{
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
  }> = [];
  const chat = vi
    .fn<() => Response | Promise<Response>>()
    .mockImplementation(success);
  const initialize = vi
    .fn<() => Response | Promise<Response>>()
    .mockImplementation(() =>
      Response.json({ ...session(), sessionId: "session-new" }),
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({
        url,
        body: JSON.parse(String(init.body)),
        headers: new Headers(init.headers),
      });
      return url.endsWith("/init") ? initialize() : chat();
    }),
  );
  const events: AgentWidgetEvent[] = [];
  const run = (signal?: AbortSignal) =>
    client.dispatch({ ...options, signal }, (event) => events.push(event));
  return {
    client,
    store,
    requests,
    chat,
    initialize,
    onSessionInit,
    onSessionExpired,
    setStoredSessionId,
    events,
    run,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("client token session renewal", () => {
  it.each([30_000, 600_000])(
    "preserves joined delivery identity across renewal with %i ms left",
    async (milliseconds) => {
      const h = await setup(milliseconds);
      (h.client as unknown as { clientSession: ClientSession }).clientSession =
        {
          ...session(milliseconds),
          durableRecovery: { enabled: true, join: true },
        };
      h.initialize.mockImplementation(() =>
        Response.json({
          ...session(),
          sessionId: "session-new",
          durableRecovery: { enabled: true, join: true },
        }),
      );
      h.chat.mockImplementation(() =>
        Response.json(
          {
            executionId: "execution-active",
            deliveryId: "delivery-1",
            deliveryStatus: "pending",
          },
          { status: 202 },
        ),
      );
      if (milliseconds > 60_000) h.chat.mockImplementationOnce(expired);
      const onAdmission = vi.fn();
      await h.client.dispatch(
        {
          ...options,
          join: { turnId: message.id, onAdmission },
        },
        (event) => h.events.push(event),
      );
      const bodies = h.requests
        .filter((request) => request.url.endsWith("/chat"))
        .map((request) => request.body);
      expect(bodies.at(-1)).toMatchObject({
        sessionId: "session-new",
        turnId: message.id,
        submitMode: "join",
        messages: [{ id: message.id }],
      });
      if (milliseconds > 60_000)
        expect(bodies[1]).toEqual({ ...bodies[0], sessionId: "session-new" });
      expect(onAdmission).toHaveBeenCalledExactlyOnceWith({
        kind: "receipt",
        executionId: "execution-active",
        deliveryId: "delivery-1",
        status: "pending",
      });
      expect(h.events).toEqual([]);
      expect(h.onSessionInit).toHaveBeenCalledOnce();
      expect(h.onSessionExpired).not.toHaveBeenCalled();
    },
  );

  it("fails closed if renewal withdraws join support", async () => {
    const h = await setup();
    (h.client as unknown as { clientSession: ClientSession }).clientSession = {
      ...session(),
      durableRecovery: { enabled: true, join: true },
    };
    h.chat.mockImplementationOnce(expired);
    await expect(
      h.client.dispatch(
        {
          ...options,
          join: { turnId: message.id, onAdmission: vi.fn() },
        },
        (event) => h.events.push(event),
      ),
    ).rejects.toThrow("supported native");
    expect(h.chat).toHaveBeenCalledOnce();
    expect(h.events).toEqual([]);
  });

  it("renews a legacy session through its session ID without enabling shared history", async () => {
    const h = await setup(30_000);
    (h.client as unknown as { clientSession: ClientSession }).clientSession = {
      ...session(30_000),
      durableRecovery: { enabled: false },
    };
    h.initialize.mockImplementation(() =>
      Response.json({
        ...session(),
        sessionId: "session-new",
        durableRecovery: { enabled: false },
      }),
    );
    await h.run();
    expect(h.requests[0].body).toMatchObject({ sessionId: "session-old" });
    expect(h.requests[0].body).not.toHaveProperty("conversationId");
    expect(h.requests[0].body).not.toHaveProperty("visitorHistory");
    expect(h.requests[1].body.sessionId).toBe("session-new");
    expect(h.onSessionExpired).not.toHaveBeenCalled();
  });

  it("resends the full tool registry after renewal rather than reusing the old fingerprint alone", async () => {
    const h = await setup();
    const tools = [{ name: "search", description: "Search", origin: "webmcp" }];
    (h.client as unknown as { webMcpBridge: unknown }).webMcpBridge = {
      snapshotForDispatch: () => tools,
    };
    await h.run();
    h.chat.mockImplementationOnce(expired);
    await h.run();
    const bodies = h.requests
      .filter((r) => r.url.endsWith("/chat"))
      .map((r) => r.body);
    expect(bodies[0].clientTools).toEqual(tools);
    expect(bodies[1].clientTools).toBeUndefined();
    expect(bodies[2].clientTools).toEqual(tools);
    expect(bodies[2].clientToolsFingerprint).toBe(
      bodies[1].clientToolsFingerprint,
    );
  });

  it.each([30_000, -1])(
    "renews a session with %i ms left and preserves visitor-owned conversation without history UI",
    async (milliseconds) => {
      const h = await setup(milliseconds);
      await h.run();
      expect(h.requests.map((r) => r.url)).toEqual([
        "https://example.com/v1/client/init",
        "https://example.com/v1/client/chat",
      ]);
      expect(h.requests[0].body).toMatchObject({
        conversationId: "conversation-owned",
        visitorToken: "cvt_owned",
        durableRecovery: true,
      });
      expect(h.requests[0].body).not.toHaveProperty("sessionId");
      expect(h.requests[1].body).toMatchObject({
        sessionId: "session-new",
        assistantMessageId: "assistant-1",
        messages: [{ id: "user-1", content: "continue" }],
      });
      expect(h.requests[1].headers.get("X-Visitor-Token")).toBe("cvt_owned");
      expect(h.onSessionInit).toHaveBeenCalledTimes(1);
      expect(h.onSessionExpired).not.toHaveBeenCalled();
      expect(h.setStoredSessionId).toHaveBeenCalledWith("session-new");
    },
  );

  it("retries only an explicit expired-session rejection with the same payload and turn identity", async () => {
    const h = await setup();
    h.chat.mockImplementationOnce(expired);
    await h.run();
    const bodies = h.requests
      .filter((r) => r.url.endsWith("/chat"))
      .map((r) => r.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual({ ...bodies[0], sessionId: "session-new" });
    expect(h.onSessionExpired).not.toHaveBeenCalled();
  });

  it("stops after a second expired-session rejection", async () => {
    const h = await setup();
    h.chat.mockImplementation(expired);
    await expect(h.run()).rejects.toThrow("Session expired");
    expect(h.chat).toHaveBeenCalledTimes(2);
    expect(h.initialize).toHaveBeenCalledTimes(1);
    expect(h.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unrelated unauthorized response", async () => {
    const h = await setup();
    h.chat.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    await expect(h.run()).rejects.toThrow("Session expired");
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(h.initialize).not.toHaveBeenCalled();
  });

  it("does not renew or replay after cancellation during the rejected request", async () => {
    const h = await setup();
    const abort = new AbortController();
    h.chat.mockImplementation(() => {
      abort.abort();
      return expired();
    });
    await expect(h.run(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.chat).toHaveBeenCalledTimes(1);
  });

  it("does not install a renewal or post a message after cancellation during init", async () => {
    const h = await setup(30_000);
    const abort = new AbortController();
    h.initialize.mockImplementation(() => {
      abort.abort();
      return Response.json({ ...session(), sessionId: "session-new" });
    });
    await expect(h.run(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.onSessionInit).not.toHaveBeenCalled();
    expect(h.setStoredSessionId).not.toHaveBeenCalled();
  });

  it("does not fork a conversation when renewal cannot reopen it", async () => {
    const h = await setup(30_000);
    h.initialize.mockImplementation(() =>
      Response.json({ error: "not_found" }, { status: 404 }),
    );
    await expect(h.run()).rejects.toThrow("Conversation not found");
    expect(h.initialize).toHaveBeenCalledTimes(1);
    expect(h.chat).not.toHaveBeenCalled();
  });

  it("rejects a server response that switches conversations", async () => {
    const h = await setup(30_000);
    h.initialize.mockImplementation(() =>
      Response.json({ ...session(), conversationId: "different" }),
    );
    await expect(h.run()).rejects.toThrow("did not preserve");
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.onSessionInit).not.toHaveBeenCalled();
  });

  it("does not renew a durable conversation without visitor proof", async () => {
    const h = await setup(30_000);
    await h.store.clear();
    await expect(h.run()).rejects.toThrow("visitor credential");
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.chat).not.toHaveBeenCalled();
  });

  it("suppresses a superseded turn while its expired-session response is pending", async () => {
    const h = await setup();
    let rejectOld!: (response: Response) => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    h.chat.mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        rejectOld = resolve;
      });
    });
    const first = h.run();
    await firstStarted;
    await h.run();
    rejectOld(expired());
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.chat).toHaveBeenCalledTimes(2);
  });
});
