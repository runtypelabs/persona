import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWidgetConfig, AgentWidgetEvent, ClientSession } from "./types";
import * as runtime from "./client-dispatch";

const message = { id: "user", role: "user" as const, content: "hello", createdAt: "2026-10-15T00:00:00Z" };
const session: ClientSession = {
  sessionId: "session", expiresAt: new Date(Date.now() + 3_600_000),
  flow: { id: "flow", name: "Flow", description: null }, config: { welcomeMessage: null, placeholder: "", theme: null },
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

// Deliberately bypass vitest.setup's eager registrations. These tests exercise
// the same first-use boundary as the CDN build, including a pending import.
describe("cold request runtime", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function create(config: AgentWidgetConfig = { apiUrl: "https://example.test/chat" }) {
    const loader = await import("./client-dispatch-loader");
    const { AgentWidgetClient } = await import("./client");
    return { loader, client: new AgentWidgetClient(config) };
  }

  it("does not send an aborted turn after the module arrives", async () => {
    const { loader, client } = await create();
    const pending = deferred<typeof runtime>();
    loader.setClientDispatchLoader(() => pending.promise);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const abort = new AbortController();
    const events: AgentWidgetEvent[] = [];
    const send = client.dispatch({ messages: [message], signal: abort.signal }, event => events.push(event));
    const rejected = expect(send).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    pending.resolve(runtime);
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: "status", status: "connecting" }]);
  });

  it("keeps the latest client-token turn when two sends share a pending import", async () => {
    const { loader, client } = await create({ clientToken: "test-token" });
    const pending = deferred<typeof runtime>();
    const load = vi.fn(() => pending.promise);
    loader.setClientDispatchLoader(load);
    const init = vi.spyOn(client, "initSession").mockResolvedValue(session);
    const fetch = vi.fn().mockResolvedValue(new Response("", { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const first = client.dispatch({ messages: [message] }, () => {});
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = client.dispatch({ messages: [{ ...message, content: "replacement" }] }, () => {});
    pending.resolve(runtime);
    await rejected;
    await second;
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body).toContain("replacement");
  });

  it("retries a failed import on the next send", async () => {
    const { loader, client } = await create();
    const load = vi.fn().mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValue(runtime);
    loader.setClientDispatchLoader(load);
    const fetch = vi.fn().mockResolvedValue(new Response("", { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const events: AgentWidgetEvent[] = [];
    await expect(client.dispatch({ messages: [message] }, event => events.push(event))).rejects.toThrow("network unavailable");
    expect(events.at(-1)?.type).toBe("error");
    await client.dispatch({ messages: [message] }, () => {});
    expect(load).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
