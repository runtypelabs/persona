import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentWidgetWebMcpConfig,
  WebMcpConfirmHandler,
  WebMcpToolResult,
} from "./types";

// ---------------------------------------------------------------------------
// Mock the strict @mcp-b/webmcp-polyfill. The bridge dynamically imports it and
// calls `initializeWebMCPPolyfill()` (idempotent install of document.modelContext).
// We stub the install as a no-op and provide `document.modelContext` ourselves,
// modeling the strict producer-preview surface the bridge consumes:
//   - getTools(): async; inputSchema is a JSON string; NO annotations
//   - executeTool(info, argsJson, { signal }): async; validates+runs execute(),
//     returns JSON.stringify(rawResult) or null; honors the abort signal.
// ---------------------------------------------------------------------------

const polyfillMock = { initThrows: false };

vi.mock("@mcp-b/webmcp-polyfill", () => ({
  initializeWebMCPPolyfill: vi.fn(() => {
    if (polyfillMock.initThrows) throw new Error("init boom");
  }),
}));

// Import AFTER vi.mock so the bridge's dynamic import resolves to the mock.
import {
  WebMcpBridge,
  getWebMcpToolDisplayTitle,
  isWebMcpToolName,
  stripWebMcpPrefix,
  computeClientToolsFingerprint,
  setWebMcpPolyfillLoader,
} from "./webmcp-bridge";
import type { ClientToolDefinition } from "./types";

type MockClient = { requestUserInteraction: (cb: () => unknown) => Promise<unknown> };

type MockTool = {
  name: string;
  description?: string;
  inputSchema?: object;
  title?: string;
  execute: (args: Record<string, unknown>, client: MockClient) => unknown;
};

const registry: { tools: MockTool[] } = { tools: [] };

/** A fake `document.modelContext` exposing the strict consumer surface. */
const makeModelContext = () => ({
  async getTools() {
    // Mirrors the real polyfill's getRegisteredToolInfos(): `title` is always
    // present, "" when the tool didn't declare one; annotations are absent.
    return registry.tools.map((t) => ({
      name: t.name,
      description: t.description ?? `mock ${t.name}`,
      inputSchema: JSON.stringify(t.inputSchema ?? { type: "object" }),
      title: t.title ?? "",
    }));
  },
  async executeTool(
    info: { name: string },
    inputArgsJson: string,
    options?: { signal?: AbortSignal },
  ): Promise<string | null> {
    if (options?.signal?.aborted) throw new Error("Tool execution was cancelled");
    const tool = registry.tools.find((t) => t.name === info.name);
    if (!tool) throw new Error(`Tool not found: ${info.name}`);
    const args = inputArgsJson ? JSON.parse(inputArgsJson) : {};
    // The polyfill owns this client; `requestUserInteraction` is a pass-through.
    const client: MockClient = {
      requestUserInteraction: async (cb) => cb(),
    };
    const execPromise = Promise.resolve(tool.execute(args, client));
    const raced = options?.signal
      ? Promise.race<unknown>([
          execPromise,
          new Promise<never>((_, reject) => {
            const sig = options.signal!;
            if (sig.aborted) reject(new Error("Tool execution was cancelled"));
            else
              sig.addEventListener(
                "abort",
                () => reject(new Error("Tool execution was cancelled")),
                { once: true },
              );
          }),
        ])
      : execPromise;
    const raw = await raced;
    return raw === undefined ? null : JSON.stringify(raw);
  },
});

const fakeTool = (
  overrides: Partial<MockTool> & { name: string },
): MockTool => ({
  description: `mock ${overrides.name}`,
  execute: () => "ok",
  ...overrides,
});

const allowAll: WebMcpConfirmHandler = vi.fn(async () => true);

beforeEach(() => {
  vi.clearAllMocks();
  polyfillMock.initThrows = false;
  registry.tools = [];
  // location is read by snapshotForDispatch; document.modelContext is the
  // consumer surface. Both are absent in the Node test environment.
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal("document", { modelContext: makeModelContext() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The loader is module-global (page-global in production); reset so a test
  // that registers one can't leak into the default-import tests.
  setWebMcpPolyfillLoader(null);
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
  it("returns empty when config.webmcp.enabled is not set", async () => {
    const bridge = new WebMcpBridge({} as AgentWidgetWebMcpConfig);
    expect(bridge.isOperational()).toBe(false);
    expect(await bridge.snapshotForDispatch()).toEqual([]);
  });

  it("returns empty when document.modelContext is absent (no polyfill, no native)", async () => {
    vi.stubGlobal("document", {});
    const bridge = new WebMcpBridge({ enabled: true });
    expect(await bridge.snapshotForDispatch()).toEqual([]);
    expect(bridge.isOperational()).toBe(false);
  });

  it("returns empty when initializeWebMCPPolyfill() throws", async () => {
    // No pre-existing modelContext — otherwise install() short-circuits
    // before importing the polyfill and the throwing init never runs.
    vi.stubGlobal("document", {});
    polyfillMock.initThrows = true;
    const bridge = new WebMcpBridge({ enabled: true });
    expect(await bridge.snapshotForDispatch()).toEqual([]);
    expect(bridge.isOperational()).toBe(false);
  });

  it("ships only the JSON-serializable surface (name, description, schema, origin)", async () => {
    registry.tools = [
      fakeTool({
        name: "search",
        description: "search the shop",
        inputSchema: { type: "object", properties: { q: { type: "string" } } },
      }),
    ];
    const bridge = new WebMcpBridge({ enabled: true });
    const snap = await bridge.snapshotForDispatch();
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
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined();
    // Now that the registry was read, the bridge reports operational.
    expect(bridge.isOperational()).toBe(true);
  });

  it("applies client-side allowlist glob (`search_*`)", async () => {
    registry.tools = [
      fakeTool({ name: "search_products" }),
      fakeTool({ name: "add_to_cart" }),
    ];
    const bridge = new WebMcpBridge({
      enabled: true,
      allowlist: ["search_*"],
    });
    const snap = await bridge.snapshotForDispatch();
    expect(snap.map((t) => t.name)).toEqual(["search_products"]);
  });

  it("respects '*' as match-all", async () => {
    registry.tools = [fakeTool({ name: "foo" }), fakeTool({ name: "bar" })];
    const bridge = new WebMcpBridge({ enabled: true, allowlist: ["*"] });
    expect((await bridge.snapshotForDispatch()).map((t) => t.name)).toEqual([
      "foo",
      "bar",
    ]);
  });
});

describe("setWebMcpPolyfillLoader", () => {
  it("uses the registered loader instead of the bare import when no modelContext exists", async () => {
    // Start with no modelContext so install() actually loads the polyfill;
    // the loader's init then installs the registry, like the real one would.
    const doc: { modelContext?: ReturnType<typeof makeModelContext> } = {};
    vi.stubGlobal("document", doc);
    registry.tools = [fakeTool({ name: "search" })];
    const loader = vi.fn(async () => ({
      initializeWebMCPPolyfill: () => {
        doc.modelContext = makeModelContext();
      },
    }));
    setWebMcpPolyfillLoader(loader);

    const bridge = new WebMcpBridge({ enabled: true });
    const snap = await bridge.snapshotForDispatch();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(snap.map((t) => t.name)).toEqual(["search"]);
    expect(bridge.isOperational()).toBe(true);
  });

  it("disables WebMCP (with a warning) when the loader rejects", async () => {
    vi.stubGlobal("document", {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setWebMcpPolyfillLoader(() => Promise.reject(new Error("chunk 404")));

    const bridge = new WebMcpBridge({ enabled: true });
    expect(await bridge.snapshotForDispatch()).toEqual([]);
    expect(bridge.isOperational()).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load @mcp-b/webmcp-polyfill"),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("never invokes the loader when a compatible modelContext is already present", async () => {
    // beforeEach stubs a compatible document.modelContext — the install
    // short-circuit must win, so a failing loader is irrelevant.
    registry.tools = [fakeTool({ name: "search" })];
    const loader = vi.fn(() => Promise.reject(new Error("should not load")));
    setWebMcpPolyfillLoader(loader);

    const bridge = new WebMcpBridge({ enabled: true });
    const snap = await bridge.snapshotForDispatch();

    expect(loader).not.toHaveBeenCalled();
    expect(snap.map((t) => t.name)).toEqual(["search"]);
    expect(bridge.isOperational()).toBe(true);
  });
});

describe("WebMCP display titles", () => {
  it("records declared titles on snapshot and exposes them via getWebMcpToolDisplayTitle", async () => {
    registry.tools = [
      fakeTool({ name: "add_to_cart", title: "Add to Cart" }),
      fakeTool({ name: "search_products" }),
    ];
    const bridge = new WebMcpBridge({ enabled: true });
    await bridge.snapshotForDispatch();
    expect(getWebMcpToolDisplayTitle("add_to_cart")).toBe("Add to Cart");
    expect(getWebMcpToolDisplayTitle("webmcp:add_to_cart")).toBe("Add to Cart");
    expect(getWebMcpToolDisplayTitle("search_products")).toBeUndefined();
  });

  it("evicts a stale title when the tool re-registers without one", async () => {
    registry.tools = [fakeTool({ name: "add_to_cart", title: "Add to Cart" })];
    const bridge = new WebMcpBridge({ enabled: true });
    await bridge.snapshotForDispatch();
    expect(getWebMcpToolDisplayTitle("add_to_cart")).toBe("Add to Cart");

    registry.tools = [fakeTool({ name: "add_to_cart" })];
    await bridge.snapshotForDispatch();
    expect(getWebMcpToolDisplayTitle("add_to_cart")).toBeUndefined();
  });

  it("evicts the title when the tool is removed from the registry entirely", async () => {
    registry.tools = [
      fakeTool({ name: "add_to_cart", title: "Add to Cart" }),
      fakeTool({ name: "search_products", title: "Search the catalog" }),
    ];
    const bridge = new WebMcpBridge({ enabled: true });
    await bridge.snapshotForDispatch();
    expect(getWebMcpToolDisplayTitle("add_to_cart")).toBe("Add to Cart");

    registry.tools = [fakeTool({ name: "search_products", title: "Search the catalog" })];
    await bridge.snapshotForDispatch();
    expect(getWebMcpToolDisplayTitle("add_to_cart")).toBeUndefined();
    expect(getWebMcpToolDisplayTitle("search_products")).toBe("Search the catalog");
  });

  it("passes the declared title to the confirm gate", async () => {
    registry.tools = [fakeTool({ name: "add_to_cart", title: "Add to Cart" })];
    const onConfirm = vi.fn(async () => true);
    const bridge = new WebMcpBridge({ enabled: true, onConfirm });
    const r = await bridge.executeToolCall("webmcp:add_to_cart", {});
    expect(r.isError).toBeFalsy();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "add_to_cart", title: "Add to Cart" })
    );
  });

  it("omits title from the confirm gate when the tool didn't declare one", async () => {
    registry.tools = [fakeTool({ name: "add_to_cart" })];
    const onConfirm = vi.fn(async () => true);
    const bridge = new WebMcpBridge({ enabled: true, onConfirm });
    await bridge.executeToolCall("webmcp:add_to_cart", {});
    expect(onConfirm).toHaveBeenCalledWith(
      expect.not.objectContaining({ title: expect.anything() })
    );
  });
});

describe("WebMcpBridge.executeToolCall", () => {
  it("returns isError when WebMCP is not enabled", async () => {
    const bridge = new WebMcpBridge({} as AgentWidgetWebMcpConfig);
    const r = await bridge.executeToolCall("webmcp:search", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.type).toBe("text");
  });

  it("returns isError when document.modelContext is absent", async () => {
    vi.stubGlobal("document", {});
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:search", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/not operational/i);
    expect((r.content[0] as { text: string }).text).toMatch(/not available/i);
  });

  it("warns once and degrades cleanly when document.modelContext is present but incompatible", async () => {
    // A different / older WebMCP polyfill (or divergent native draft) squats
    // document.modelContext without the strict getTools()/executeTool() surface.
    // @mcp-b's initializeWebMCPPolyfill correctly declines to overwrite it, so
    // Persona must (a) report non-operational, (b) surface an actionable error
    // distinct from "not available", and (c) warn exactly once.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("document", {
      modelContext: { registerTool: () => undefined }, // no getTools/executeTool
    });
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });

    expect(await bridge.snapshotForDispatch()).toEqual([]);
    expect(bridge.isOperational()).toBe(false);

    const r = await bridge.executeToolCall("webmcp:search", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/present but/i);

    // Warned about the incompatible context, exactly once despite multiple hits.
    const incompatWarnings = warnSpy.mock.calls.filter(([msg]) =>
      String(msg).includes("does not expose getTools()/executeTool()"),
    );
    expect(incompatWarnings).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it("strips the webmcp: prefix before registry lookup and forwards args", async () => {
    const execute = vi.fn(() => ({ matches: 3 }));
    registry.tools = [fakeTool({ name: "search", execute })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:search", { q: "shoes" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ q: "shoes" }, expect.anything());
    expect(r.isError).toBeUndefined();
  });

  it("returns isError when the tool is not in the registry (unmount race)", async () => {
    registry.tools = [fakeTool({ name: "search" })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:add_to_cart", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/not registered/);
  });

  it("normalizes a string return into a single text content block", async () => {
    registry.tools = [fakeTool({ name: "ping", execute: () => "pong" })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:ping", {});
    expect(r).toEqual({ content: [{ type: "text", text: "pong" }] });
  });

  it("normalizes an object return by JSON-stringifying it", async () => {
    registry.tools = [
      fakeTool({ name: "lookup", execute: () => ({ found: true, n: 7 }) }),
    ];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:lookup", {});
    expect(r.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ found: true, n: 7 }),
    });
  });

  it("passes already-MCP-shaped returns through unchanged", async () => {
    const shaped: WebMcpToolResult = {
      content: [
        { type: "text", text: "hi" },
        { type: "image", url: "x" },
      ],
    };
    registry.tools = [fakeTool({ name: "render", execute: () => shaped })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:render", {});
    expect(r).toEqual(shaped);
  });

  it("normalizes an undefined return into an empty text block", async () => {
    registry.tools = [fakeTool({ name: "act", execute: () => undefined })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:act", {});
    expect(r).toEqual({ content: [{ type: "text", text: "" }] });
  });

  it("runs a tool's client.requestUserInteraction callback without a second confirm", async () => {
    const confirmSpy = vi.fn(async () => true);
    registry.tools = [
      fakeTool({
        name: "sensitive",
        execute: async (_args, client) => {
          const ack = await client.requestUserInteraction(async () => "ok!");
          return { ack };
        },
      }),
    ];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: confirmSpy });
    const r = await bridge.executeToolCall("webmcp:sensitive", {});
    // Only the single outer gate fires — the polyfill owns the in-tool callback.
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ ack: "ok!" }),
    });
  });

  it("returns isError when the user declines the confirm gate", async () => {
    const decline: WebMcpConfirmHandler = vi.fn(async () => false);
    const executeSpy = vi.fn(() => "should not run");
    registry.tools = [fakeTool({ name: "checkout", execute: executeSpy })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: decline });
    const r = await bridge.executeToolCall("webmcp:checkout", { sku: "x" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/declined/);
    expect(decline).toHaveBeenCalledTimes(1);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("translates a thrown execute() into an isError result (no rethrow)", async () => {
    registry.tools = [
      fakeTool({
        name: "boom",
        execute: () => {
          throw new Error("network down");
        },
      }),
    ];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const r = await bridge.executeToolCall("webmcp:boom", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toBe("network down");
  });

  it("times out an execute() that exceeds the 30s budget", async () => {
    vi.useFakeTimers();
    try {
      registry.tools = [
        fakeTool({ name: "slow", execute: () => new Promise(() => undefined) }),
      ];
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

  it("bails before rendering the confirm bubble when signal is already aborted", async () => {
    // A late approval after cancel() must not fire a host-page side effect. The
    // bridge checks the signal BEFORE rendering the confirm.
    const confirmSpy = vi.fn(async () => true);
    const executeSpy = vi.fn(() => "should not run");
    registry.tools = [fakeTool({ name: "checkout", execute: executeSpy })];
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
    let resolveStuck: ((v: string) => void) | undefined;
    const stuck = new Promise<string>((resolve) => {
      resolveStuck = resolve;
    });
    const executeSpy = vi.fn(() => stuck);
    registry.tools = [fakeTool({ name: "slow", execute: executeSpy })];
    const bridge = new WebMcpBridge({ enabled: true, onConfirm: allowAll });
    const controller = new AbortController();
    const pending = bridge.executeToolCall(
      "webmcp:slow",
      {},
      controller.signal,
    );
    // Wait until execute() has actually started, then cancel.
    await vi.waitFor(() => expect(executeSpy).toHaveBeenCalledTimes(1));
    controller.abort();
    const r = await pending;
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/abort/i);
    // Late resolve from the page side — must not poison anything.
    resolveStuck?.("late");
  });

  it("rejects a webmcp call for a tool excluded by the client allowlist", async () => {
    // snapshotForDispatch filters by allowlist for the wire surface, but
    // executeToolCall must also re-check it — defense-in-depth alongside the
    // server-side check.
    const executeSpy = vi.fn(() => "should not run");
    registry.tools = [
      fakeTool({ name: "secret_admin_action", execute: executeSpy }),
    ];
    const bridge = new WebMcpBridge({
      enabled: true,
      onConfirm: allowAll,
      allowlist: ["search_*"],
    });
    const r = await bridge.executeToolCall("webmcp:secret_admin_action", {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/allowlist/i);
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe("computeClientToolsFingerprint — diff-only / send-once", () => {
  const tool = (over: Partial<ClientToolDefinition> = {}): ClientToolDefinition => ({
    name: "search",
    description: "Search the catalog",
    parametersSchema: { type: "object", properties: { q: { type: "string" } } },
    origin: "webmcp",
    ...over,
  });

  it("returns a stable sentinel for an empty set", () => {
    expect(computeClientToolsFingerprint([])).toBe(computeClientToolsFingerprint([]));
    expect(computeClientToolsFingerprint([])).toBe("0:empty");
  });

  it("is deterministic for the same set", () => {
    const a = computeClientToolsFingerprint([tool({ name: "a" }), tool({ name: "b" })]);
    const b = computeClientToolsFingerprint([tool({ name: "a" }), tool({ name: "b" })]);
    expect(a).toBe(b);
  });

  it("is order-independent (tool order does not matter)", () => {
    const ab = computeClientToolsFingerprint([tool({ name: "a" }), tool({ name: "b" })]);
    const ba = computeClientToolsFingerprint([tool({ name: "b" }), tool({ name: "a" })]);
    expect(ab).toBe(ba);
  });

  it("changes when a description changes", () => {
    expect(computeClientToolsFingerprint([tool({ description: "x" })])).not.toBe(
      computeClientToolsFingerprint([tool({ description: "y" })]),
    );
  });

  it("changes when the schema changes", () => {
    const base = computeClientToolsFingerprint([tool()]);
    const changed = computeClientToolsFingerprint([
      tool({ parametersSchema: { type: "object", properties: { q: { type: "number" } } } }),
    ]);
    expect(changed).not.toBe(base);
  });

  it("changes when a tool is added", () => {
    const one = computeClientToolsFingerprint([tool({ name: "a" })]);
    const two = computeClientToolsFingerprint([tool({ name: "a" }), tool({ name: "b" })]);
    expect(two).not.toBe(one);
  });

  it("ignores pageOrigin (audit metadata, not part of the contract)", () => {
    const withOrigin = computeClientToolsFingerprint([tool({ pageOrigin: "https://a.example" })]);
    const without = computeClientToolsFingerprint([tool({ pageOrigin: undefined })]);
    expect(withOrigin).toBe(without);
  });

  it("reflects annotations (they ride along to the server)", () => {
    const plain = computeClientToolsFingerprint([tool()]);
    const annotated = computeClientToolsFingerprint([
      tool({ annotations: { readOnlyHint: true } }),
    ]);
    expect(annotated).not.toBe(plain);
  });

  it("stays within the server's 128-char wire bound for large tool sets", () => {
    // The server validates `clientToolsFingerprint` as `z.string().max(128)`.
    // A fingerprint that grew with the tool content would 400 the first turn.
    const many = Array.from({ length: 50 }, (_, i) =>
      tool({
        name: `tool_${i}`,
        description: `A fairly long description for tool number ${i} `.repeat(8),
        parametersSchema: {
          type: "object",
          properties: { a: { type: "string" }, b: { type: "number" }, c: { type: "boolean" } },
        },
      }),
    );
    const fp = computeClientToolsFingerprint(many);
    expect(fp.length).toBeLessThanOrEqual(128);
  });
});
