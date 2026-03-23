import { describe, it, expect, afterEach } from "vitest";
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
