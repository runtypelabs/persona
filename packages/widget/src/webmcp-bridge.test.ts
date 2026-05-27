import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ModelContextClient,
  Tool,
  ToolEntry,
} from "@runtypelabs/webmcp-polyfill";
import type {
  AgentWidgetWebMcpConfig,
  WebMcpConfirmHandler,
  WebMcpToolResult,
} from "./types";

// `installPolyfill` is the bridge's single dependency on the npm package.
// Mocking it lets us control the `InstallResult` shape per test without
// dragging a jsdom navigator + secure-context guard into the picture.
type MockPolyfillState = {
  status:
    | "installed"
    | "installed-merged"
    | "deferred-native"
    | "skipped-iframe"
    | "skipped-insecure"
    | "skipped-no-window"
    | "skipped-frozen-navigator";
  entries: ToolEntry[];
  installThrows?: boolean;
};

const polyfillState: MockPolyfillState = {
  status: "installed",
  entries: [],
};

vi.mock("@runtypelabs/webmcp-polyfill", () => ({
  installPolyfill: vi.fn(() => {
    if (polyfillState.installThrows) {
      throw new Error("install boom");
    }
    if (polyfillState.status === "deferred-native") {
      return {
        status: "deferred-native",
        modelContext: null,
        version: "0.0.0-test",
      };
    }
    if (
      polyfillState.status === "skipped-iframe" ||
      polyfillState.status === "skipped-insecure" ||
      polyfillState.status === "skipped-no-window" ||
      polyfillState.status === "skipped-frozen-navigator"
    ) {
      return {
        status: polyfillState.status,
        modelContext: null,
        version: "0.0.0-test",
      };
    }
    const mc = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      registerTool: vi.fn(),
      ontoolchange: null,
      __runtype_polyfill_version: "0.0.0-test",
      __getRegisteredTools: () => polyfillState.entries.slice(),
    };
    return {
      status: polyfillState.status,
      modelContext: mc,
      version: "0.0.0-test",
    };
  }),
}));

// Import AFTER vi.mock so the bridge picks up the mock binding.
import {
  WebMcpBridge,
  isWebMcpToolName,
  stripWebMcpPrefix,
} from "./webmcp-bridge";

const resetPolyfillState = (next: Partial<MockPolyfillState> = {}): void => {
  polyfillState.status = next.status ?? "installed";
  polyfillState.entries = next.entries ?? [];
  polyfillState.installThrows = next.installThrows;
};

const fakeTool = (
  overrides: Partial<Tool> & { name: string },
): ToolEntry => ({
  tool: {
    description: `mock ${overrides.name}`,
    execute: () => "ok",
    ...overrides,
  } as Tool,
  registeredAt: Date.now(),
});

const allowAll: WebMcpConfirmHandler = vi.fn(async () => true);

beforeEach(() => {
  vi.clearAllMocks();
  resetPolyfillState();
  // location is read by snapshotForDispatch — keep it deterministic.
  vi.stubGlobal("location", { origin: "https://example.test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stripWebMcpPrefix", () => {
  it("strips a leading 'webmcp:' prefix", () => {
    expect(stripWebMcpPrefix("webmcp:add_to_cart")).toBe("add_to_cart");
  });
  it("leaves names without the prefix untouched", () => {
    expect(stripWebMcpPrefix("add_to_cart")).toBe("add_to_cart");
  });
});

describe("isWebMcpToolName", () => {
  it("returns true for prefixed names", () => {
    expect(isWebMcpToolName("webmcp:search")).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(isWebMcpToolName("builtin:search")).toBe(false);
    expect(isWebMcpToolName("search")).toBe(false);
  });
});

describe("WebMcpBridge.snapshotForDispatch", () => {
  it("returns empty when config.webmcp.enabled is not set", () => {
    const bridge = new WebMcpBridge({} as AgentWidgetWebMcpConfig);
    expect(bridge.isOperational()).toBe(false);
    expect(bridge.snapshotForDispatch()).toEqual([]);
  });

  it("returns empty on a deferred-native install (no read API available)", () => {
    resetPolyfillState({ status: "deferred-native" });
    const bridge = new WebMcpBridge({ enabled: true });
    expect(bridge.isOperational()).toBe(false);
    expect(bridge.snapshotForDispatch()).toEqual([]);
  });

  it("returns empty when installPolyfill() throws", () => {
    resetPolyfillState({ installThrows: true });
    const bridge = new WebMcpBridge({ enabled: true });
    expect(bridge.isOperational()).toBe(false);
    expect(bridge.snapshotForDispatch()).toEqual([]);
  });

  it("ships only the JSON-serializable surface (no execute, no signal)", () => {
    resetPolyfillState({
      entries: [
        fakeTool({
          name: "search",
          description: "search the shop",
          inputSchema: { type: "object", properties: { q: { type: "string" } } },
          annotations: { readOnlyHint: true },
        }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true });
    const snap = bridge.snapshotForDispatch();
    expect(snap).toHaveLength(1);
    const tool = snap[0]!;
    expect(tool.name).toBe("search");
    expect(tool.description).toBe("search the shop");
    expect(tool.parametersSchema).toEqual({
      type: "object",
      properties: { q: { type: "string" } },
    });
    expect(tool.origin).toBe("webmcp");
    expect(tool.pageOrigin).toBe("https://example.test");
    expect(tool.annotations).toEqual({ readOnlyHint: true });
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined();
  });

  it("applies client-side allowlist glob (`search_*`)", () => {
    resetPolyfillState({
      entries: [
        fakeTool({ name: "search_products", description: "" }),
        fakeTool({ name: "add_to_cart", description: "" }),
      ],
    });
    const bridge = new WebMcpBridge({
      enabled: true,
      allowlist: ["search_*"],
    });
    const snap = bridge.snapshotForDispatch();
    expect(snap.map((t) => t.name)).toEqual(["search_products"]);
  });

  it("respects '*' as match-all", () => {
    resetPolyfillState({
      entries: [
        fakeTool({ name: "foo", description: "" }),
        fakeTool({ name: "bar", description: "" }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, allowlist: ["*"] });
    expect(bridge.snapshotForDispatch().map((t) => t.name)).toEqual([
      "foo",
      "bar",
    ]);
  });
});

describe("WebMcpBridge.executeToolCall", () => {
  it("returns isError when the bridge is not operational", async () => {
    const bridge = new WebMcpBridge({} as AgentWidgetWebMcpConfig);
    const r = await bridge.executeToolCall("webmcp:search", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.type).toBe("text");
  });

  it("strips the webmcp: prefix before registry lookup", async () => {
    const execute = vi.fn(() => ({ matches: 3 }));
    resetPolyfillState({
      entries: [fakeTool({ name: "search", execute })],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:search", { q: "shoes" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ q: "shoes" }, expect.anything());
    expect(r.isError).toBeUndefined();
  });

  it("returns isError when the tool is not in the registry (unmount race)", async () => {
    resetPolyfillState({
      entries: [fakeTool({ name: "search" })],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:add_to_cart", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/not registered/);
  });

  it("normalizes a string return into a single text content block", async () => {
    resetPolyfillState({
      entries: [fakeTool({ name: "ping", execute: () => "pong" })],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:ping", {});
    expect(r).toEqual({ content: [{ type: "text", text: "pong" }] });
  });

  it("normalizes an object return by JSON-stringifying it", async () => {
    resetPolyfillState({
      entries: [
        fakeTool({ name: "lookup", execute: () => ({ found: true, n: 7 }) }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:lookup", {});
    expect(r.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ found: true, n: 7 }),
    });
  });

  it("passes already-MCP-shaped returns through unchanged", async () => {
    const shaped: WebMcpToolResult = {
      content: [{ type: "text", text: "hi" }, { type: "image", url: "x" }],
    };
    resetPolyfillState({
      entries: [fakeTool({ name: "render", execute: () => shaped })],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:render", {});
    expect(r).toEqual(shaped);
  });

  it("forwards untrustedContentHint from tool annotations onto results", async () => {
    resetPolyfillState({
      entries: [
        fakeTool({
          name: "fetch_reviews",
          execute: () => "user-generated text",
          annotations: { untrustedContentHint: true },
        }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:fetch_reviews", {});
    expect(r.annotations).toEqual({ untrustedContentHint: true });
  });

  it("returns isError when the user declines the confirm gate", async () => {
    const decline: WebMcpConfirmHandler = vi.fn(async () => false);
    resetPolyfillState({
      entries: [
        fakeTool({
          name: "checkout",
          execute: vi.fn(() => "should not run"),
        }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: decline });
    const r = await bridge.executeToolCall("webmcp:checkout", { sku: "x" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/declined/);
    expect(decline).toHaveBeenCalledTimes(1);
  });

  it("translates a thrown execute() into an isError result (no rethrow)", async () => {
    resetPolyfillState({
      entries: [
        fakeTool({
          name: "boom",
          execute: () => {
            throw new Error("network down");
          },
        }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:boom", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toBe("network down");
  });

  it("times out an `execute()` that exceeds the 30s budget", async () => {
    vi.useFakeTimers();
    try {
      resetPolyfillState({
        entries: [
          fakeTool({
            name: "slow",
            execute: () => new Promise(() => undefined),
          }),
        ],
      });
      const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
      const pending = bridge.executeToolCall("webmcp:slow", {});
      await vi.advanceTimersByTimeAsync(30_000);
      const r = await pending;
      expect(r.isError).toBe(true);
      expect((r.content[0] as { text: string }).text).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-renders the confirm bubble when the tool calls client.requestUserInteraction", async () => {
    const calls: Array<{ reason?: string }> = [];
    const handler: WebMcpConfirmHandler = vi.fn(async (info) => {
      calls.push({ reason: info.reason });
      return true;
    });
    let observedClient: ModelContextClient | null = null;
    resetPolyfillState({
      entries: [
        fakeTool({
          name: "sensitive",
          execute: async (_args, client) => {
            observedClient = client;
            const ok = await client.requestUserInteraction(async () => "ok!");
            return { ack: ok };
          },
        }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: handler });
    const r = await bridge.executeToolCall("webmcp:sensitive", {});

    expect(observedClient).not.toBeNull();
    // Both the gate AND the requestUserInteraction step render bubbles.
    expect(calls.map((c) => c.reason)).toEqual([
      "gate",
      "requestUserInteraction",
    ]);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ ack: "ok!" }),
    });
  });

  it("bails before rendering the confirm bubble when signal is already aborted", async () => {
    // BugBot finding #12: a late approval after cancel() must not fire a
    // host-page side effect. The bridge checks signal BEFORE rendering the
    // confirm, so the user can't approve a tool call that the session has
    // already given up on.
    const confirmSpy = vi.fn(async () => true);
    const executeSpy = vi.fn(() => "should not run");
    resetPolyfillState({
      entries: [
        fakeTool({ name: "checkout", execute: executeSpy }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: confirmSpy });
    const controller = new AbortController();
    controller.abort();
    const r = await bridge.executeToolCall(
      "webmcp:checkout",
      {},
      controller.signal,
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/abort/i);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("aborts a stuck execute() when the signal fires mid-flight", async () => {
    // BugBot finding #12 (cont.): if the tool's execute() never resolves, the
    // signal must still let the bridge return promptly so the session can
    // stop awaiting and skip /resume.
    let resolveStuck: ((v: string) => void) | undefined;
    const stuck = new Promise<string>((resolve) => {
      resolveStuck = resolve;
    });
    const executeSpy = vi.fn(() => stuck);
    resetPolyfillState({
      entries: [fakeTool({ name: "slow", execute: executeSpy })],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const controller = new AbortController();
    const pending = bridge.executeToolCall(
      "webmcp:slow",
      {},
      controller.signal,
    );
    // Let the gate's await resolve so execute() actually runs.
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    const r = await pending;
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/abort/i);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    // Late resolve from the page side — must not poison anything.
    resolveStuck?.("late");
  });

  it("translates a declined requestUserInteraction into a tool throw → isError", async () => {
    let firstCall = true;
    const handler: WebMcpConfirmHandler = vi.fn(async () => {
      // Approve the outer gate, decline the in-tool requestUserInteraction.
      if (firstCall) {
        firstCall = false;
        return true;
      }
      return false;
    });
    resetPolyfillState({
      entries: [
        fakeTool({
          name: "sensitive",
          execute: async (_args, client) => {
            await client.requestUserInteraction(async () => "should not run");
            return "ok";
          },
        }),
      ],
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: handler });
    const r = await bridge.executeToolCall("webmcp:sensitive", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(
      /declined interaction/i,
    );
  });
});
