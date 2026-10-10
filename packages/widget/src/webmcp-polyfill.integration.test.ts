import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type {} from "@mcp-b/webmcp-polyfill";
import { WebMcpBridge } from "./webmcp-bridge-public";

// jsdom has a document but omits secure-context detection and browser task ports.
// Use real Node ports, closing them after this suite's document has finished.
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://example.test",
  runScripts: "outside-only",
});
const browser = dom.window;
const channels: MessageChannel[] = [];
const registrations: AbortController[] = [];
beforeAll(() => {
  Object.defineProperty(browser, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(browser, "MessageChannel", {
    value: class extends MessageChannel {
      constructor() {
        super();
        channels.push(this);
      }
    },
    configurable: true,
  });
  vi.stubGlobal("AbortController", browser.AbortController);
  vi.stubGlobal("AbortSignal", browser.AbortSignal);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("location", browser.location);
  // Run the published IIFE inside the actual window realm. Vitest's globalThis
  // proxy does not have the native Window.window getter required by upstream.
  browser.eval(
    readFileSync(
      createRequire(import.meta.url).resolve("@mcp-b/webmcp-polyfill/iife"),
      "utf8"
    )
  );
  return () => {
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
    dom.window.close();
    vi.unstubAllGlobals();
  };
});
afterEach(() => {
  for (const registration of registrations.splice(0)) registration.abort();
});

const register = async (
  name: string,
  execute: (input: unknown, options: { signal: AbortSignal }) => unknown
) => {
  const registration = new browser.AbortController();
  registrations.push(registration);
  await document.modelContext!.registerTool(
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
const bridge = () =>
  new WebMcpBridge({ enabled: true, onConfirm: async () => true });

describe("WebMcpBridge with the published polyfill", () => {
  it("discovers and executes a registered tool with object input", async () => {
    await register("lookup", (input) => ({ received: input }));
    const consumer = bridge();
    expect(await consumer.snapshotForDispatch()).toEqual([
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
    expect(
      await consumer.executeToolCall("webmcp:lookup", { query: "shoes" })
    ).toEqual({
      content: [{ type: "text", text: '{"received":{"query":"shoes"}}' }],
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

  it("returns an error for non-serializable results without rerunning the tool", async () => {
    let calls = 0;
    await register("undefined_result", () => {
      calls++;
      return undefined;
    });
    const result = await bridge().executeToolCall(
      "webmcp:undefined_result",
      {}
    );
    expect(result.isError).toBe(true);
    expect(calls).toBe(1);
  });

  it("propagates cancellation to the registered callback", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cancelled!: () => void;
    const aborted = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    await register(
      "wait",
      (_input, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              cancelled();
              resolve("stopped");
            },
            { once: true }
          );
          started();
        })
    );
    const controller = new AbortController();
    const pending = bridge().executeToolCall(
      "webmcp:wait",
      {},
      controller.signal
    );
    await ready;
    controller.abort();
    expect((await pending).isError).toBe(true);
    await aborted;
  });

  it("does not execute a removed registration", async () => {
    let calls = 0;
    await register("removed", () => {
      calls++;
      return "unexpected";
    });
    registrations.at(-1)!.abort();
    expect((await bridge().executeToolCall("webmcp:removed", {})).isError).toBe(
      true
    );
    expect(calls).toBe(0);
  });
});
