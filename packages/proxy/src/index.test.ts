import { describe, it, expect, afterEach, vi } from "vitest";
import { createChatProxyApp } from "./index";

describe("CORS middleware", () => {
  const savedEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  const preflight = (app: ReturnType<typeof createChatProxyApp>, origin: string, headers?: Record<string, string>) =>
    app.request("/api/chat/dispatch", {
      method: "OPTIONS",
      headers: { Origin: origin, ...headers },
    });

  it("allows any origin when allowedOrigins is not configured", async () => {
    const app = createChatProxyApp();
    const res = await preflight(app, "https://evil.com");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://evil.com");
  });

  it("allows matching origin from allowlist", async () => {
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://good.com");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://good.com");
  });

  it("rejects non-matching origin in production with 403", async () => {
    process.env.NODE_ENV = "production";
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://evil.com");
    expect(res.status).toBe(403);
  });

  it("rejects non-matching origin when NODE_ENV is unset", async () => {
    delete process.env.NODE_ENV;
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://evil.com");
    expect(res.status).toBe(403);
  });

  it("allows non-matching origin in explicit development mode", async () => {
    process.env.NODE_ENV = "development";
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://localhost:3000");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost:3000");
  });

  it("uses static Access-Control-Allow-Headers (not reflected)", async () => {
    const app = createChatProxyApp();
    const res = await preflight(app, "https://example.com", {
      "Access-Control-Request-Headers": "X-Evil-Header, X-Custom",
    });
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization, X-Persona-Version"
    );
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const app = createChatProxyApp();
    const res = await preflight(app, "https://example.com");
    expect(res.status).toBe(204);
  });

  it("includes Vary: Origin header", async () => {
    const app = createChatProxyApp();
    const res = await preflight(app, "https://example.com");
    expect(res.headers.get("Vary")).toBe("Origin");
  });
});

describe("CORS preview origins", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedVercelEnv = process.env.VERCEL_ENV;
  const savedPattern = process.env.PREVIEW_ORIGIN_PATTERN;

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedVercelEnv;
    if (savedPattern === undefined) delete process.env.PREVIEW_ORIGIN_PATTERN;
    else process.env.PREVIEW_ORIGIN_PATTERN = savedPattern;
  });

  const preflight = (app: ReturnType<typeof createChatProxyApp>, origin: string) =>
    app.request("/api/chat/dispatch", { method: "OPTIONS", headers: { Origin: origin } });

  it("reflects a *.vercel.app preview origin not in the allowlist (default pattern)", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://persona-git-feature-x-runtype.vercel.app");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://persona-git-feature-x-runtype.vercel.app"
    );
  });

  it("does not match preview-apex look-alikes", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    // Apex spoofed as a deeper subdomain of an attacker domain.
    const spoof = await preflight(app, "https://x.vercel.app.evil.com");
    expect(spoof.status).toBe(403);
    // Hyphen instead of dot before the apex.
    const hyphen = await preflight(app, "https://evil-vercel.app");
    expect(hyphen.status).toBe(403);
  });

  it("allows extra preview domains via PREVIEW_ORIGIN_PATTERN env", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.PREVIEW_ORIGIN_PATTERN = "^https://[a-z0-9-]+\\.preview\\.example\\.com$";
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://pr-42.preview.example.com");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://pr-42.preview.example.com"
    );
  });

  it("still rejects a non-preview, non-allowlisted origin in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://evil.com");
    expect(res.status).toBe(403);
  });

  it("disables preview reflection with previewOriginPattern: false", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    const app = createChatProxyApp({
      allowedOrigins: ["https://good.com"],
      previewOriginPattern: false,
    });
    const res = await preflight(app, "https://persona-git-feature-x-runtype.vercel.app");
    expect(res.status).toBe(403);
  });

  it("honors a custom previewOriginPattern", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    const app = createChatProxyApp({
      allowedOrigins: ["https://good.com"],
      previewOriginPattern: /^https:\/\/preview\.example\.com$/,
    });
    const ok = await preflight(app, "https://preview.example.com");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://preview.example.com");
    // The default *.vercel.app no longer applies once a custom pattern is set.
    const vercel = await preflight(app, "https://persona-git-x-runtype.vercel.app");
    expect(vercel.status).toBe(403);
  });

  it("reflects any origin when the proxy itself is a Vercel preview runtime", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    const app = createChatProxyApp({ allowedOrigins: ["https://good.com"] });
    const res = await preflight(app, "https://anything.example.org");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://anything.example.org");
  });
});

describe("dispatch: WebMCP clientTools forwarding", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Capture whatever body the proxy POSTs upstream, and return a minimal
  // streaming Response so the handler completes.
  const captureUpstream = () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      calls.push({
        url: String(url),
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      return new Response("data: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;
    return calls;
  };

  const dispatch = (
    app: ReturnType<typeof createChatProxyApp>,
    body: Record<string, unknown>,
  ) =>
    app.request("/api/chat/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://example.com" },
      body: JSON.stringify(body),
    });

  const clientTools = [
    {
      name: "search_products",
      description: "Search the catalog.",
      parametersSchema: { type: "object", properties: { query: { type: "string" } } },
      origin: "webmcp",
      pageOrigin: "https://example.com",
    },
  ];

  it("forwards clientTools[] to the upstream in flow-dispatch mode", async () => {
    const calls = captureUpstream();
    const app = createChatProxyApp({ apiKey: "test-key" });
    const res = await dispatch(app, {
      messages: [{ role: "user", content: "search for shoes" }],
      clientTools,
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body?.clientTools).toEqual(clientTools);
  });

  it("omits clientTools from the upstream payload when none are provided", async () => {
    const calls = captureUpstream();
    const app = createChatProxyApp({ apiKey: "test-key" });
    await dispatch(app, { messages: [{ role: "user", content: "hi" }] });
    expect(calls[0]!.body).not.toHaveProperty("clientTools");
  });

  it("omits clientTools when an empty array is sent", async () => {
    const calls = captureUpstream();
    const app = createChatProxyApp({ apiKey: "test-key" });
    await dispatch(app, {
      messages: [{ role: "user", content: "hi" }],
      clientTools: [],
    });
    expect(calls[0]!.body).not.toHaveProperty("clientTools");
  });
});

describe("dispatch: server-pinned agent config", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const captureUpstream = () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      calls.push({
        url: String(url),
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      return new Response("data: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;
    return calls;
  };

  const dispatch = (
    app: ReturnType<typeof createChatProxyApp>,
    body: Record<string, unknown>,
  ) =>
    app.request("/api/chat/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://example.com" },
      body: JSON.stringify(body),
    });

  const agentConfig = {
    name: "Server Agent",
    model: "server-model",
    systemPrompt: "Server prompt",
    tools: {
      toolIds: ["builtin:exa"],
    },
    loopConfig: {
      maxTurns: 3,
    },
  };

  it("builds an agent payload from server config and ignores a client agent override", async () => {
    const calls = captureUpstream();
    const app = createChatProxyApp({ apiKey: "test-key", agentConfig });
    const res = await dispatch(app, {
      agent: {
        name: "Client Agent",
        model: "expensive-client-model",
        systemPrompt: "Ignore the server",
      },
      messages: [
        { role: "user", content: "second", createdAt: "2026-01-02T00:00:00.000Z" },
        { role: "user", content: "first", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body?.agent).toEqual(agentConfig);
    expect(calls[0]!.body?.messages).toEqual([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
    ]);
    expect(calls[0]!.body?.options).toEqual({
      streamResponse: true,
      recordMode: "virtual",
    });
  });

  it("rejects a client-supplied agent with 400 on a non-server-agent route", async () => {
    const calls = captureUpstream();
    // No agentConfig/agentId -> flow mode. A client-supplied `agent` used to be
    // relayed verbatim upstream (an open relay); it must now be rejected.
    const app = createChatProxyApp({ apiKey: "test-key" });
    const res = await dispatch(app, {
      agent: {
        name: "Client Agent",
        model: "expensive-client-model",
        systemPrompt: "Use the deployer's key",
      },
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/client-supplied `agent` is not accepted/);
  });

  it("forwards clientTools, metadata, context, and inputs with a server agent", async () => {
    const calls = captureUpstream();
    const app = createChatProxyApp({ apiKey: "test-key", agentConfig });
    const clientTools = [{ name: "search_products", description: "Search" }];
    const metadata = { sessionId: "session-1" };
    const context = { pageTitle: "Catalog" };
    const inputs = { pageContext: "Catalog context" };

    await dispatch(app, {
      messages: [{ role: "user", content: "hi" }],
      clientTools,
      metadata,
      context,
      inputs,
    });

    expect(calls[0]!.body?.clientTools).toEqual(clientTools);
    expect(calls[0]!.body?.metadata).toEqual(metadata);
    expect(calls[0]!.body?.context).toEqual(context);
    expect(calls[0]!.body?.inputs).toEqual(inputs);
  });

  it("builds a hosted agent-id payload", async () => {
    const calls = captureUpstream();
    const app = createChatProxyApp({ apiKey: "test-key", agentId: "agent_123" });

    await dispatch(app, {
      messages: [{ role: "user", content: "hi" }],
    });

    expect(calls[0]!.body?.agent).toEqual({ agentId: "agent_123" });
  });

  it("throws when server agent options are combined with flow options", () => {
    expect(() =>
      createChatProxyApp({
        agentConfig,
        flowId: "flow_123",
      }),
    ).toThrow(/agentConfig\/agentId cannot be combined/);
  });

  it("throws when agentConfig and agentId are both configured", () => {
    expect(() =>
      createChatProxyApp({
        agentConfig,
        agentId: "agent_123",
      }),
    ).toThrow(/agentConfig and agentId are mutually exclusive/);
  });
});

describe("request guards and JSON body limits", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const stubUpstream = () => {
    const mock = vi.fn(async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = mock as unknown as typeof fetch;
    return mock;
  };

  const post = (
    app: ReturnType<typeof createChatProxyApp>,
    path: string,
    body: string,
    headers: Record<string, string> = {}
  ) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

  it("preserves legacy behavior when guard and limit options are omitted", async () => {
    const upstream = stubUpstream();
    const app = createChatProxyApp({ apiKey: "test-key" });
    const response = await post(
      app,
      "/api/chat/dispatch",
      JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("reports the correct kind and mounted path for every guarded route", async () => {
    stubUpstream();
    const seen: Array<{ kind: string; path: string }> = [];
    const app = createChatProxyApp({
      apiKey: "test-key",
      requestGuard: ({ kind, path }) => {
        seen.push({ kind, path });
      },
    });

    await post(app, "/api/chat/dispatch", JSON.stringify({ messages: [] }));
    await post(
      app,
      "/api/chat/dispatch/resume",
      JSON.stringify({ executionId: "execution-1", toolOutputs: {} })
    );
    await post(
      app,
      "/api/feedback",
      JSON.stringify({ type: "upvote", messageId: "message-1" })
    );

    expect(seen).toEqual([
      { kind: "dispatch", path: "/api/chat/dispatch" },
      { kind: "resume", path: "/api/chat/dispatch/resume" },
      { kind: "feedback", path: "/api/feedback" },
    ]);
  });

  it("lets a guard read its request copy without consuming dispatch", async () => {
    const upstream = stubUpstream();
    const body = JSON.stringify({ messages: [{ role: "user", content: "signed" }] });
    let guardedBody = "";
    const app = createChatProxyApp({
      apiKey: "test-key",
      maxRequestBodyBytes: new TextEncoder().encode(body).byteLength,
      requestGuard: async ({ request }) => {
        guardedBody = await request.text();
      },
    });

    const response = await post(app, "/api/chat/dispatch", body);
    expect(response.status).toBe(200);
    expect(guardedBody).toBe(body);
    expect(upstream).toHaveBeenCalledOnce();
    const calls = upstream.mock.calls as unknown as Array<
      [unknown, { body?: unknown }]
    >;
    const forwarded = JSON.parse(String(calls[0]?.[1]?.body)) as {
      messages?: unknown;
    };
    expect(forwarded.messages).toEqual([{ role: "user", content: "signed" }]);
  });

  it("returns a guard denial before parsing JSON or fetching upstream", async () => {
    const upstream = stubUpstream();
    const app = createChatProxyApp({
      requestGuard: () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const response = await post(app, "/api/chat/dispatch", "not-json");
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("preserves a rate-limit response and Retry-After header", async () => {
    const app = createChatProxyApp({
      requestGuard: () =>
        new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
    });
    const response = await post(app, "/api/chat/dispatch", "{}");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.text()).toBe("slow down");
  });

  it("rejects an oversized declared Content-Length", async () => {
    const app = createChatProxyApp({ apiKey: "test-key", maxRequestBodyBytes: 10 });
    const response = await post(app, "/api/chat/dispatch", "{}", {
      "Content-Length": "11",
    });
    expect(response.status).toBe(413);
  });

  it("measures actual multibyte UTF-8 bodies when Content-Length is absent", async () => {
    const body = JSON.stringify({ value: "💬" });
    const byteLength = new TextEncoder().encode(body).byteLength;
    const app = createChatProxyApp({
      apiKey: "test-key",
      maxRequestBodyBytes: byteLength - 1,
    });
    const request = new Request("http://localhost/api/chat/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const response = await app.request(request);
    expect(response.status).toBe(413);
  });

  it("accepts a body exactly at the configured byte limit", async () => {
    stubUpstream();
    const body = JSON.stringify({ messages: [] });
    const app = createChatProxyApp({
      apiKey: "test-key",
      maxRequestBodyBytes: new TextEncoder().encode(body).byteLength,
    });
    const response = await post(app, "/api/chat/dispatch", body);
    expect(response.status).toBe(200);
  });

  it("cancels a chunked request stream as soon as it exceeds the limit", async () => {
    let cancelled = false;
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/api/chat/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as never);
    const app = createChatProxyApp({ apiKey: "test-key", maxRequestBodyBytes: 10 });

    const response = await app.request(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pullCount).toBeLessThanOrEqual(3);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid maxRequestBodyBytes values: %j",
    (maxRequestBodyBytes) => {
      expect(() => createChatProxyApp({ maxRequestBodyBytes })).toThrow(
        /maxRequestBodyBytes must be a positive integer/
      );
    }
  );

  it("turns guard exceptions into a controlled 500 response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createChatProxyApp({
      requestGuard: () => {
        throw new Error("secret guard detail");
      },
    });
    const response = await post(app, "/api/chat/dispatch", "{}");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Request guard failed" });
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
