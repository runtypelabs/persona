import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import type { ClientSession } from "./types";

const initBody = (sessionId: string, ttl = 600_000) => ({
  sessionId,
  expiresAt: new Date(Date.now() + ttl).toISOString(),
  flow: { id: "agent-1", name: "Agent", description: null },
  config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
});

type Reply = () => Response | Promise<Response>;

function setup(replies: Reply[] = []) {
  const initRequests: Array<{ body: Record<string, unknown>; headers: Headers }> = [];
  const chatRequests: string[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/client/init")) {
        initRequests.push({
          body: JSON.parse(String(init.body)),
          headers: new Headers(init.headers),
        });
        const reply = replies[n++];
        return reply ? reply() : Response.json(initBody(`session-${n}`));
      }
      chatRequests.push(url);
      return new Response('data: {"type":"done"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      });
    })
  );
  const onSessionExpired = vi.fn();
  const onSessionInit = vi.fn();
  const client = new AgentWidgetClient({
    clientToken: "ct_test_warm",
    apiUrl: "https://example.com",
    onSessionExpired,
    onSessionInit,
  });
  return { client, initRequests, chatRequests, onSessionExpired, onSessionInit };
}

const send = (client: AgentWidgetClient) =>
  client.dispatch(
    {
      messages: [
        { id: "u1", role: "user", content: "hi", createdAt: new Date().toISOString() },
      ],
      assistantMessageId: "a1",
    },
    () => {}
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentWidgetClient.warmSession", () => {
  it("an early init followed immediately by a send issues exactly one init", async () => {
    const { client, initRequests, chatRequests } = setup();
    void client.warmSession();
    await send(client);
    expect(initRequests).toHaveLength(1);
    expect(chatRequests).toHaveLength(1);
  });

  it("a send while the early init is still in flight reuses it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { client, initRequests, chatRequests } = setup([
      async () => {
        await gate;
        return Response.json(initBody("session-slow"));
      },
    ]);
    const warmed = client.warmSession();
    const sent = send(client);
    await vi.waitFor(() => expect(initRequests).toHaveLength(1));
    expect(chatRequests).toHaveLength(0);
    release();
    await sent;
    await expect(warmed).resolves.toMatchObject({ sessionId: "session-slow" });
    expect(initRequests).toHaveLength(1);
    expect(chatRequests).toHaveLength(1);
  });

  it("sends the same init request the send would", async () => {
    const early = setup();
    await early.client.warmSession();
    vi.unstubAllGlobals();
    const lazy = setup();
    await send(lazy.client);
    expect(early.initRequests[0].body).toEqual(lazy.initRequests[0].body);
    const headerMap = (headers: Headers) => {
      const out: Record<string, string> = {};
      headers.forEach((value, key) => (out[key] = value));
      return out;
    };
    expect(headerMap(early.initRequests[0].headers)).toEqual(
      headerMap(lazy.initRequests[0].headers)
    );
  });

  it("swallows failures silently and lets the send retry init", async () => {
    const { client, initRequests, chatRequests, onSessionExpired } = setup([
      () => Response.json({ error: "boom" }, { status: 500 }),
    ]);
    await expect(client.warmSession()).resolves.toBeNull();
    expect(onSessionExpired).not.toHaveBeenCalled();
    // Latched: further intent signals do not hammer init after a failure.
    await client.warmSession();
    expect(initRequests).toHaveLength(1);
    await send(client);
    expect(initRequests).toHaveLength(2);
    expect(chatRequests).toHaveLength(1);
  });

  it("is a no-op while a session is live", async () => {
    const { client, initRequests } = setup();
    await client.warmSession();
    await client.warmSession();
    expect(initRequests).toHaveLength(1);
  });

  it("re-arms when the session is cleared (start-new, credential change)", async () => {
    const { client, initRequests } = setup([
      () => Response.json({ error: "boom" }, { status: 500 }),
    ]);
    await client.warmSession();
    await client.warmSession();
    expect(initRequests).toHaveLength(1);
    client.clearClientSession();
    await expect(client.warmSession()).resolves.toMatchObject({ sessionId: "session-2" });
    expect(initRequests).toHaveLength(2);
  });

  it("re-arms after start-new-conversation installs a fresh session", async () => {
    const { client, initRequests } = setup([
      () => Response.json({ error: "boom" }, { status: 500 }),
      // Start-new's own session; expired so the next early init is observable.
      () => Response.json(initBody("session-new-conversation", -1_000)),
    ]);
    await client.warmSession();
    await client.warmSession();
    expect(initRequests).toHaveLength(1);
    const prepared = await client.prepareNewConversationSession();
    prepared.commit();
    expect(initRequests).toHaveLength(2);
    await expect(client.warmSession()).resolves.toMatchObject({ sessionId: "session-3" });
    expect(initRequests).toHaveLength(3);
  });

  it("re-arms once the session expires", async () => {
    const { client, initRequests } = setup([
      () => Response.json(initBody("session-short", -1_000)),
    ]);
    await client.warmSession();
    expect(initRequests).toHaveLength(1);
    await expect(client.warmSession()).resolves.toMatchObject({ sessionId: "session-2" });
    expect(initRequests).toHaveLength(2);
  });

  it("does nothing outside client token mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new AgentWidgetClient({ apiUrl: "https://example.com/api/chat" });
    await expect(client.warmSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("feedback before any init initializes the session on demand", async () => {
    const { client, initRequests } = setup();
    const feedbackUrls: string[] = [];
    const inner = globalThis.fetch as unknown as (u: string, i: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("/feedback")) {
          feedbackUrls.push(url);
          return Response.json({ ok: true });
        }
        return inner(url, init);
      })
    );
    await client.submitMessageFeedback("m1", "upvote");
    expect(initRequests).toHaveLength(1);
    expect(feedbackUrls).toHaveLength(1);
    expect((client.getClientSession() as ClientSession).sessionId).toBe("session-1");
  });
});
