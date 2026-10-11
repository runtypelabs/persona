import { describe, expect, it, vi } from "vitest";

import { AgentWidgetClient } from "./client";
import type { ClientToolDefinition } from "./types";
import { computeClientToolsFingerprint } from "./webmcp-bridge";

const tool: ClientToolDefinition = {
  name: "next_slide",
  description: "Advance the presentation to the next slide.",
  parametersSchema: { type: "object", properties: {} },
  origin: "webmcp",
  annotations: { readOnlyHint: true },
};

const withBridge = (bridge: Record<string, unknown>) => {
  const client = new AgentWidgetClient({ apiUrl: "http://test", webmcp: { enabled: true } });
  (client as unknown as { webMcpBridge: unknown }).webMcpBridge = bridge;
  return client;
};

describe("AgentWidgetClient.getVoiceClientTools", () => {
  it("is null when WebMCP is off", () => {
    expect(new AgentWidgetClient({ apiUrl: "http://test" }).getVoiceClientTools()).toBeNull();
  });

  it("snapshots exactly the dispatch clientTools[] entries, with their fingerprint", async () => {
    const client = withBridge({ snapshotForDispatch: async () => [tool] });
    const snapshot = await client.getVoiceClientTools()!.snapshot();
    expect(snapshot).toEqual({ tools: [tool], fingerprint: computeClientToolsFingerprint([tool]) });
  });

  it("routes execute and change subscriptions to the bridge's voice methods", async () => {
    const stop = vi.fn();
    const watchToolChanges = vi.fn(() => stop);
    const executeVoiceToolCall = vi.fn(async () => ({ status: "completed", result: { slidePosition: 2 } }));
    const surface = withBridge({ watchToolChanges, executeVoiceToolCall }).getVoiceClientTools()!;

    const signal = new AbortController().signal;
    const outcome = await surface.execute("webmcp:next_slide", {}, { signal, autoConfirmReadOnly: true });
    expect(executeVoiceToolCall).toHaveBeenCalledWith("webmcp:next_slide", {}, { signal, autoConfirmReadOnly: true });
    expect(outcome).toEqual({ status: "completed", result: { slidePosition: 2 } });

    const listener = vi.fn();
    const unsubscribe = surface.onChange(listener);
    await Promise.resolve();
    await Promise.resolve();
    expect(watchToolChanges).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("opens a fast-tier session from the lazy chunk that sends the snapshot through the channel", async () => {
    const client = new AgentWidgetClient({ apiUrl: "http://test", webmcp: { enabled: true } });
    const slot = client as unknown as { webMcpBridge: unknown };
    // Let the real lazy bridge adopt first, so it cannot replace the fake mid-test.
    await vi.waitFor(() => expect(slot.webMcpBridge).not.toBeNull());
    slot.webMcpBridge = { snapshotForDispatch: async () => [tool], watchToolChanges: () => () => undefined };
    const surface = client.getVoiceClientTools()!;
    const sent: Array<Record<string, unknown>> = [];
    const session = await surface.open({ send: (frame) => (sent.push(frame), true), cancelled: () => false });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ type: "client_tools", tools: [{ ...tool, name: "webmcp:next_slide" }] });
    session.close();
  });
});
