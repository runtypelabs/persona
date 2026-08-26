import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, AgentWidgetMessage } from "./types";

const messages: AgentWidgetMessage[] = [
  {
    id: "usr_1",
    role: "user",
    content: "hello",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const initResponse = () =>
  ({
    ok: true,
    json: async () => ({
      sessionId: "cs_1",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      config: {},
    }),
  }) as unknown as Response;

/** A stream whose frames are released one at a time by the test. */
const controlledStream = () => {
  const encoder = new TextEncoder();
  let push!: (frame: string) => void;
  let close!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (frame) => controller.enqueue(encoder.encode(frame));
      close = () => controller.close();
    },
  });
  return {
    push,
    close,
    response: {
      ok: true,
      status: 200,
      headers: new Headers(),
      body,
    } as unknown as Response,
  };
};

const clientTokenClient = () =>
  new AgentWidgetClient({ clientToken: "ct_test" } as never);

describe("client-token turn identity", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("carries a turnId on every send and no submitMode by default", async () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (url: unknown, init: any) => {
      if (String(url).endsWith("/v1/client/init")) return initResponse();
      bodies.push(JSON.parse(init.body));
      const stream = controlledStream();
      stream.close();
      return stream.response;
    }) as unknown as typeof fetch;

    const client = clientTokenClient();
    await client.dispatch({ messages }, () => {});
    await client.dispatch({ messages }, () => {});

    expect(bodies).toHaveLength(2);
    expect(typeof bodies[0].turnId).toBe("string");
    expect(typeof bodies[1].turnId).toBe("string");
    expect(bodies[0].turnId).not.toBe(bodies[1].turnId);
    expect(bodies[0].submitMode).toBeUndefined();
  });

  it("an interrupting send carries submitMode and a fresh turnId", async () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (url: unknown, init: any) => {
      if (String(url).endsWith("/v1/client/init")) return initResponse();
      bodies.push(JSON.parse(init.body));
      const stream = controlledStream();
      stream.close();
      return stream.response;
    }) as unknown as typeof fetch;

    const client = clientTokenClient();
    await client.dispatch({ messages }, () => {});
    await client.dispatch({ messages, interrupt: true }, () => {});

    expect(bodies[1].submitMode).toBe("interrupt");
    expect(bodies[1].turnId).not.toBe(bodies[0].turnId);
  });

  it("drops SSE events belonging to a superseded turn", async () => {
    const first = controlledStream();
    const second = controlledStream();
    const streams = [first, second];
    let index = 0;
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/v1/client/init")) return initResponse();
      const stream = streams[index];
      index += 1;
      return stream.response;
    }) as unknown as typeof fetch;

    const client = clientTokenClient();
    const firstEvents: AgentWidgetEvent[] = [];
    const secondEvents: AgentWidgetEvent[] = [];

    const firstDispatch = client.dispatch({ messages }, (event) =>
      firstEvents.push(event)
    );
    // Let the first dispatch claim the turn and start streaming.
    await vi.waitFor(() =>
      expect(firstEvents.some((e) => e.type === "status")).toBe(true)
    );

    const secondDispatch = client.dispatch({ messages, interrupt: true }, (event) =>
      secondEvents.push(event)
    );
    await vi.waitFor(() => expect(index).toBe(2));

    const beforeCount = firstEvents.length;
    first.push('data: {"type":"flow_complete","success":true}\n\n');
    first.close();
    second.push('data: {"type":"flow_complete","success":true}\n\n');
    second.close();
    await Promise.all([firstDispatch, secondDispatch]);

    // Nothing from the superseded run reached its handler after the takeover:
    // not its frames, not its terminal `idle` status.
    expect(firstEvents.length).toBe(beforeCount);
    expect(secondEvents.length).toBeGreaterThan(0);
    expect(secondEvents.at(-1)).toEqual({ type: "status", status: "idle" });
  });
});
