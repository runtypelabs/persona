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
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
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

describe("dispatch — WebMCP clientTools forwarding", () => {
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
