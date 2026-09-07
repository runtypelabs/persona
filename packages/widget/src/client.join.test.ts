import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentWidgetClient,
  InputDeliveryError,
  type JoinAdmission,
} from "./client";
import type { AgentWidgetEvent, AgentWidgetMessage } from "./types";

const message = (id: string): AgentWidgetMessage => ({
  id,
  role: "user",
  content: id,
  createdAt: new Date().toISOString(),
});
function stream(executionId = "exec_1", deliveryId = "delivery_1") {
  let push!: (text: string) => void;
  let close!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (text) => controller.enqueue(new TextEncoder().encode(text));
      close = () => controller.close();
    },
  });
  return {
    push,
    close,
    response: new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "X-Runtype-Execution-Id": executionId,
        "X-Runtype-Delivery-Id": deliveryId,
      },
    }),
  };
}
function client(join = true) {
  const instance = new AgentWidgetClient({ clientToken: "ct_test" });
  vi.spyOn(instance, "initSession").mockResolvedValue({
    sessionId: "cs_1",
    conversationId: "conv_1",
    expiresAt: new Date(Date.now() + 300_000),
    durableRecovery: { enabled: true, join },
    config: {},
  } as never);
  return instance;
}
const receipt = () =>
  Response.json(
    {
      accepted: true,
      executionId: "exec_1",
      deliveryId: "delivery_2",
      deliveryStatus: "pending",
    },
    { status: 202 },
  );
afterEach(() => vi.restoreAllMocks());

describe("client-token live input admission", () => {
  it("a receipt does not steal or idle the incumbent stream", async () => {
    const first = stream();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(first.response)
        .mockResolvedValueOnce(receipt()),
    );
    const instance = client();
    const firstEvents: AgentWidgetEvent[] = [];
    const secondEvents: AgentWidgetEvent[] = [];
    const admissions: JoinAdmission[] = [];
    const running = instance.dispatch(
      {
        messages: [message("first")],
        join: {
          turnId: "first",
          onAdmission: (value) => admissions.push(value),
        },
      },
      (event) => firstEvents.push(event),
    );
    await vi.waitFor(() => expect(admissions).toHaveLength(1));
    await instance.dispatch(
      {
        messages: [message("second")],
        join: {
          turnId: "second",
          onAdmission: (value) => admissions.push(value),
        },
      },
      (event) => secondEvents.push(event),
    );
    expect(admissions.map((value) => value.kind)).toEqual([
      "stream",
      "receipt",
    ]);
    expect(secondEvents).toEqual([]);
    first.push('data: {"type":"execution_complete","success":true}\n\n');
    first.close();
    await running;
    expect(
      firstEvents.some(
        (event) => event.type === "status" && event.terminal === true,
      ),
    ).toBe(true);
    expect(firstEvents.at(-1)).toEqual({ type: "status", status: "idle" });
  });

  it("retries a lost acknowledgement with exactly the same payload and key", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network drop"))
      .mockResolvedValueOnce(receipt());
    vi.stubGlobal("fetch", fetcher);
    await client().dispatch(
      {
        messages: [
          { ...message("delta"), content: "display", llmContent: "model only" },
        ],
        join: { turnId: "delta", onAdmission: () => {} },
      },
      () => {},
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.turnId).toBe("delta");
    expect(sent.submitMode).toBe("join");
    expect(sent.messages).toEqual([
      { id: "delta", role: "user", content: "model only" },
    ]);
  });

  it("a rejected delivery emits no incumbent stream error or idle", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "incompatible" }, { status: 409 }),
        ),
    );
    const events: AgentWidgetEvent[] = [];
    await expect(
      client().dispatch(
        {
          messages: [message("delta")],
          join: { turnId: "delta", onAdmission: () => {} },
        },
        (event) => events.push(event),
      ),
    ).rejects.toBeInstanceOf(InputDeliveryError);
    expect(events).toEqual([]);
  });

  it("fails closed before posting on an unsupported init capability", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      client(false).dispatch(
        {
          messages: [message("delta")],
          join: { turnId: "delta", onAdmission: () => {} },
        },
        () => {},
      ),
    ).rejects.toThrow("supported native");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a browser-supplied assistant transcript for join", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      client().dispatch(
        {
          messages: [{ ...message("old"), role: "assistant" }],
          join: { turnId: "delta", onAdmission: () => {} },
        },
        () => {},
      ),
    ).rejects.toThrow("new user messages only");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
