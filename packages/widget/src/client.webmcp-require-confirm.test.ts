// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentWidgetClient } from "./client";
import type { AgentWidgetConfig, ClientInitResponse, WebMcpConfirmHandler } from "./types";

const API_URL = "https://api.runtype.com";

const initBody = (config: Record<string, unknown> = {}): ClientInitResponse =>
  ({
    sessionId: "sess_1",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    flow: { id: "flow_1", name: "Flow", description: null },
    config: { welcomeMessage: null, placeholder: "Ask...", theme: null, ...config },
  }) as ClientInitResponse;

const installInit = (body: ClientInitResponse) => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
};

const makeClient = (webmcp?: AgentWidgetConfig["webmcp"]) =>
  new AgentWidgetClient({
    apiUrl: API_URL,
    clientToken: "ct_live_x",
    ...(webmcp ? { webmcp } : {}),
  });

afterEach(() => {
  vi.restoreAllMocks();
  delete (document as Document & { modelContext?: unknown }).modelContext;
});

describe("client-token init: config.webmcp.requireConfirmFor", () => {
  it("keeps the surface's patterns on the session", async () => {
    installInit(initBody({ webmcp: { requireConfirmFor: ["checkout_*"] } }));
    const session = await makeClient().initSession();
    expect(session.config.webmcp).toEqual({ requireConfirmFor: ["checkout_*"] });
  });

  it.each([
    ["absent", {}],
    ["empty", { webmcp: { requireConfirmFor: [] } }],
    ["malformed", { webmcp: { requireConfirmFor: "checkout_*" } }],
  ])("omits config.webmcp when the list is %s", async (_label, config) => {
    installInit(initBody(config));
    const session = await makeClient().initSession();
    expect(session.config).not.toHaveProperty("webmcp");
  });
});

describe("client-token init feeds the WebMCP confirm gate", () => {
  it("flags a matched page tool for the host's onConfirm after init", async () => {
    const execute = vi.fn(async () => JSON.stringify("ran"));
    (document as Document & { modelContext?: unknown }).modelContext = {
      getTools: async () => [
        { name: "checkout_submit", description: "Place the order", title: "", window, origin: location.origin },
        { name: "search", description: "Search", title: "", window, origin: location.origin },
      ],
      executeTool: execute,
    };
    installInit(initBody({ webmcp: { requireConfirmFor: ["checkout_*"] } }));
    const onConfirm = vi.fn<WebMcpConfirmHandler>(async () => true);
    const client = makeClient({ enabled: true, onConfirm });
    await client.initSession();

    await client.executeWebMcpToolCall("webmcp:checkout_submit", {});
    await client.executeWebMcpToolCall("webmcp:search", {});

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      toolName: "checkout_submit",
      confirmRequired: true,
    });
    expect(onConfirm.mock.calls[1]?.[0]).not.toHaveProperty("confirmRequired");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("voice before any client-token init", () => {
  const installReadOnlyTools = () => {
    (document as Document & { modelContext?: unknown }).modelContext = {
      getTools: async () =>
        ["checkout_preview", "next_slide"].map((name) => ({
          name,
          description: name,
          title: "",
          window,
          origin: location.origin,
          annotations: { readOnlyHint: true },
        })),
      executeTool: vi.fn(async () => JSON.stringify("ran")),
    };
  };
  const voiceExecute = (client: AgentWidgetClient, name: string) =>
    client
      .getVoiceClientTools()!
      .execute(name, {}, { signal: new AbortController().signal, autoConfirmReadOnly: true });

  it("loads the surface policy so a matched read-only tool still confirms", async () => {
    installReadOnlyTools();
    installInit(initBody({ webmcp: { requireConfirmFor: ["checkout_*"] } }));
    const onConfirm = vi.fn<WebMcpConfirmHandler>(async () => false);
    const client = makeClient({ enabled: true, onConfirm });

    const matched = await voiceExecute(client, "webmcp:checkout_preview");
    const unmatched = await voiceExecute(client, "webmcp:next_slide");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      toolName: "checkout_preview",
      confirmRequired: true,
    });
    expect(matched.status).toBe("denied");
    expect(unmatched.status).toBe("completed");
  });

  it("keeps every voice call gated when init fails", async () => {
    installReadOnlyTools();
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const onConfirm = vi.fn<WebMcpConfirmHandler>(async () => false);
    const client = makeClient({ enabled: true, onConfirm });

    const result = await voiceExecute(client, "webmcp:next_slide");

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("denied");
  });
});
