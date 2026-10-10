import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { WebMcpBridge } from "./webmcp-bridge-public";
import { setWebMcpPolyfillLoader } from "./webmcp-bridge";
import type { ModelContextCoreLike } from "./webmcp-bridge";

type ToolCallback = (
  input: unknown,
  options?: { signal: AbortSignal }
) => unknown;
type TestContext = ModelContextCoreLike & {
  registerTool(
    tool: {
      name: string;
      description: string;
      title?: string;
      inputSchema?: object;
      annotations?: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: ToolCallback;
    },
    options?: { signal: AbortSignal }
  ): Promise<void>;
};

// Run the actual published distributions, not version-shaped mocks. The v5
// alias is test-only: it stands in for host pages that install an older,
// JSON-string runtime themselves. Persona's own fallback is v6.
describe.each([
  { version: "v5", module: "webmcp-polyfill-v5", legacy: true },
  { version: "v6", module: "@mcp-b/webmcp-polyfill", legacy: false },
])("WebMcpBridge with published $version", ({ module, legacy }) => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://example.test",
    runScripts: "outside-only",
  });
  const browser = dom.window;
  const channels: MessageChannel[] = [];
  const registrations: AbortController[] = [];
  let context: TestContext;

  beforeAll(() => {
    // v5 also runs without the newer browser APIs required by v6. These are
    // intentionally absent to exercise the compatibility of our fallback.
    Object.defineProperty(browser, "isSecureContext", { value: true });
    if (legacy) {
      Object.defineProperty(browser.Promise, "withResolvers", {
        value: undefined,
      });
      Object.defineProperty(browser.AbortSignal, "any", { value: undefined });
      Object.defineProperty(browser.URL, "parse", { value: undefined });
    }
    Object.defineProperty(browser, "MessageChannel", {
      value: class extends MessageChannel {
        constructor() {
          super();
          channels.push(this);
        }
      },
    });
    vi.stubGlobal("AbortController", browser.AbortController);
    vi.stubGlobal("AbortSignal", browser.AbortSignal);
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("location", browser.location);
    // A true Window realm is required by v6's native Window.window getter.
    browser.eval(
      readFileSync(
        createRequire(import.meta.url).resolve(`${module}/iife`),
        "utf8"
      )
    );
    context = (browser.document as unknown as { modelContext: TestContext })
      .modelContext;
  });
  afterEach(() => {
    for (const registration of registrations.splice(0)) registration.abort();
    setWebMcpPolyfillLoader(null);
  });
  afterAll(() => {
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
    browser.close();
    vi.unstubAllGlobals();
  });

  const register = async (name: string, execute: ToolCallback) => {
    const registration = new browser.AbortController();
    registrations.push(registration);
    await context.registerTool(
      {
        name,
        description: `Run ${name}`,
        title: "Local tool",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute,
      },
      { signal: registration.signal }
    );
  };
  const bridge = (onConfirm = vi.fn(async () => true)) =>
    new WebMcpBridge({ enabled: true, onConfirm });

  it("discovers tools without replacing the host registry or loading a fallback", async () => {
    const load = vi.fn(async () => {
      throw new Error("must preserve the host registry");
    });
    setWebMcpPolyfillLoader(load);
    await register("lookup", (input) => ({ received: input }));
    expect(await bridge().snapshotForDispatch()).toEqual([
      expect.objectContaining({
        name: "lookup",
        parametersSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        untrustedContentHint: true,
      }),
    ]);
    expect(load).not.toHaveBeenCalled();
    expect(
      (browser.document as unknown as { modelContext: TestContext })
        .modelContext
    ).toBe(context);
  });

  it.each(
    [
      { query: "shoes" },
      { nested: { text: 'quotes " and emoji 😀' }, values: [true, null, 2] },
      { toString: "an ordinary JSON property", valueOf: 7, __proto__: null },
      ["array", { nested: true }],
    ].map((args) => ({ args }))
  )(
    "executes JSON arguments once without mutating them: $args",
    async ({ args }) => {
      const execute = vi.fn((input: unknown) => ({ received: input }));
      const confirm = vi.fn(async () => true);
      const before = JSON.stringify(args);
      await register("lookup", execute);
      const result = await bridge(confirm).executeToolCall(
        "webmcp:lookup",
        args
      );
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ received: args }) }],
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]![0]).toEqual(JSON.parse(before));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(args)).toBe(before);
      expect(Object.getOwnPropertySymbols(args)).toEqual([]);
    }
  );

  it.each([undefined, () => "not JSON"])(
    "defaults absent/non-JSON arguments to an empty object",
    async (args) => {
      const execute = vi.fn((input: unknown) => input);
      await register("empty", execute);
      expect(await bridge().executeToolCall("webmcp:empty", args)).toEqual({
        content: [{ type: "text", text: "{}" }],
      });
      expect(execute).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps the legacy empty-object fallback for circular arguments", async () => {
    const args: { self?: unknown } = {};
    args.self = args;
    await register("empty", (input) => input);
    expect(await bridge().executeToolCall("webmcp:empty", args)).toEqual({
      content: [{ type: "text", text: "{}" }],
    });
  });

  it.each([
    ["string", "hello", "hello"],
    ["null", null, "null"],
    [
      "envelope",
      { isError: true, content: [{ type: "text", text: "invalid input" }] },
      null,
    ],
  ])("preserves a %s result", async (_label, result, text) => {
    await register("result", () => result);
    expect(await bridge().executeToolCall("webmcp:result", {})).toEqual(
      text === null ? result : { content: [{ type: "text", text }] }
    );
  });

  const circularResult: { self?: unknown } = {};
  circularResult.self = circularResult;
  it.each([
    { label: "undefined", result: undefined },
    { label: "circular object", result: circularResult },
    { label: "function", result: () => "function result" },
    { label: "BigInt", result: 1n },
  ])(
    "preserves the installed runtime's $label-result semantics without retries",
    async ({ result }) => {
      const execute = vi.fn(() => result);
      await register("unserializable_result", execute);
      const output = await bridge().executeToolCall(
        "webmcp:unserializable_result",
        {}
      );
      if (legacy) {
        expect(output).toEqual({
          content: [{ type: "text", text: String(result) }],
        });
      } else {
        expect(output.isError).toBe(true);
      }
      expect(execute).toHaveBeenCalledTimes(1);
    }
  );

  it("preserves the installed runtime's empty-string result", async () => {
    await register("empty_result", () => "");
    expect(await bridge().executeToolCall("webmcp:empty_result", {})).toEqual({
      content: [{ type: "text", text: legacy ? "Operation succeeded" : "" }],
    });
  });

  it("returns callback failures without retrying a side effect", async () => {
    const execute = vi.fn(() => {
      throw new Error("failure after side effect");
    });
    await register("failed", execute);
    expect((await bridge().executeToolCall("webmcp:failed", {})).isError).toBe(
      true
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not execute when approval is denied", async () => {
    const execute = vi.fn(() => "unexpected");
    await register("denied", execute);
    expect(
      (
        await bridge(vi.fn(async () => false)).executeToolCall(
          "webmcp:denied",
          {}
        )
      ).isError
    ).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("cancels the invocation and forwards the signal when the runtime supports it", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let callbackSignal: AbortSignal | undefined;
    const execute = vi.fn(
      (_input: unknown, options?: { signal: AbortSignal }) => {
        callbackSignal = options?.signal;
        started();
        return new Promise(() => {});
      }
    );
    await register("wait", execute);
    const controller = new AbortController();
    const pending = bridge().executeToolCall(
      "webmcp:wait",
      {},
      controller.signal
    );
    await ready;
    controller.abort();
    expect((await pending).isError).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    if (!legacy)
      await vi.waitFor(() => expect(callbackSignal?.aborted).toBe(true));
  });

  it("does not execute a removed registration", async () => {
    const execute = vi.fn(() => "unexpected");
    await register("removed", execute);
    registrations.at(-1)!.abort();
    expect((await bridge().executeToolCall("webmcp:removed", {})).isError).toBe(
      true
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it.runIf(legacy)(
    "lazily installs a legacy runtime from a custom loader without v6 browser APIs",
    async () => {
      const runtime = (
        browser as unknown as {
          WebMCPPolyfill: {
            cleanupWebMCPPolyfill(): void;
            initializeWebMCPPolyfill(): void;
          };
        }
      ).WebMCPPolyfill;
      runtime.cleanupWebMCPPolyfill();
      expect(
        (browser.document as unknown as { modelContext?: unknown }).modelContext
      ).toBeUndefined();
      expect(Reflect.get(browser.Promise, "withResolvers")).toBeUndefined();
      expect(browser.AbortSignal.any).toBeUndefined();
      expect(browser.URL.parse).toBeUndefined();
      const load = vi.fn(async () => runtime);
      setWebMcpPolyfillLoader(load);
      const consumer = bridge();
      expect(await consumer.snapshotForDispatch()).toEqual([]);
      context = (browser.document as unknown as { modelContext: TestContext })
        .modelContext;
      await register("legacy_fallback", () => undefined);
      expect(
        await consumer.executeToolCall("webmcp:legacy_fallback", {})
      ).toEqual({
        content: [{ type: "text", text: "undefined" }],
      });
      expect(load).toHaveBeenCalledTimes(1);
      expect(consumer.isOperational()).toBe(true);
    }
  );
});

// Persona's own fallback: a fresh realm per test, because v6 has no uninstall.
describe("WebMcpBridge v6 fallback", () => {
  const realms: Array<{ close(): void }> = [];
  const channels: MessageChannel[] = [];

  const createRealm = ({ modern }: { modern: boolean }) => {
    const dom = new JSDOM("<!doctype html><body></body>", {
      url: "https://example.test",
      runScripts: "outside-only",
    });
    const browser = dom.window;
    realms.push(browser);
    Object.defineProperty(browser, "isSecureContext", { value: true });
    if (!modern) {
      Object.defineProperty(browser.Promise, "withResolvers", {
        value: undefined,
      });
    }
    Object.defineProperty(browser, "MessageChannel", {
      value: class extends MessageChannel {
        constructor() {
          super();
          channels.push(this);
        }
      },
    });
    vi.stubGlobal("AbortController", browser.AbortController);
    vi.stubGlobal("AbortSignal", browser.AbortSignal);
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("location", browser.location);
    // Evaluate without auto-install so the bridge's lazy install is what runs.
    const source = readFileSync(
      createRequire(import.meta.url).resolve("@mcp-b/webmcp-polyfill/iife"),
      "utf8"
    );
    Object.defineProperty(browser.document, "modelContext", {
      configurable: true,
      value: undefined,
    });
    browser.eval(source);
    Reflect.deleteProperty(browser.document, "modelContext");
    const runtime = (
      browser as unknown as { WebMCPPolyfill: { installWebMCP(): void } }
    ).WebMCPPolyfill;
    return { browser, runtime };
  };

  afterEach(() => {
    setWebMcpPolyfillLoader(null);
    for (const channel of channels.splice(0)) {
      channel.port1.close();
      channel.port2.close();
    }
    for (const realm of realms.splice(0)) realm.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("installs v6 and applies upstream callback semantics", async () => {
    const { browser, runtime } = createRealm({ modern: true });
    expect(
      (browser.document as unknown as { modelContext?: unknown }).modelContext
    ).toBeUndefined();
    const load = vi.fn(async () => runtime);
    setWebMcpPolyfillLoader(load);
    const consumer = new WebMcpBridge({
      enabled: true,
      onConfirm: vi.fn(async () => true),
    });
    expect(await consumer.snapshotForDispatch()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(consumer.isOperational()).toBe(true);

    const context = (browser.document as unknown as { modelContext: TestContext })
      .modelContext;
    const registration = new browser.AbortController();
    const register = (name: string, execute: ToolCallback) =>
      context.registerTool(
        { name, description: `Run ${name}`, execute },
        { signal: registration.signal }
      );
    await register("echo", (input) => ({ received: input }));
    await register("silent", () => undefined);
    await register("thrower", () => {
      throw new Error("Quantity must be positive");
    });

    expect(
      await consumer.executeToolCall("webmcp:echo", { quantity: 2 })
    ).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ received: { quantity: 2 } }) },
      ],
    });
    expect((await consumer.executeToolCall("webmcp:silent", {})).isError).toBe(
      true
    );
    const thrown = await consumer.executeToolCall("webmcp:thrower", {});
    expect(thrown.isError).toBe(true);
    expect(JSON.stringify(thrown)).not.toContain("Quantity must be positive");
    expect(
      (browser.navigator as unknown as { modelContext?: unknown }).modelContext
    ).toBeUndefined();
    registration.abort();
  });

  it("warns and stays inert on engines without the v6 baseline", async () => {
    const { browser, runtime } = createRealm({ modern: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setWebMcpPolyfillLoader(async () => runtime);
    const consumer = new WebMcpBridge({
      enabled: true,
      onConfirm: vi.fn(async () => true),
    });
    expect(await consumer.snapshotForDispatch()).toEqual([]);
    expect(consumer.isOperational()).toBe(false);
    expect(
      (browser.document as unknown as { modelContext?: unknown }).modelContext
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("did not install document.modelContext"),
    );
  });
});
