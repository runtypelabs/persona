import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentWidgetClient,
  InputDeliveryError,
  type SteerAdmission,
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
function client(steer = true) {
  const instance = new AgentWidgetClient({ clientToken: "ct_test" });
  vi.spyOn(instance, "initSession").mockResolvedValue({
    sessionId: "cs_1",
    conversationId: "conv_1",
    expiresAt: new Date(Date.now() + 300_000),
    durableRecovery: { enabled: true, steer },
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
    const admissions: SteerAdmission[] = [];
    const running = instance.dispatch(
      {
        messages: [message("first")],
        steer: {
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
        steer: {
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
        steer: { turnId: "delta", onAdmission: () => {} },
      },
      () => {},
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.turnId).toBe("delta");
    expect(sent.submitMode).toBe("steer");
    expect(sent.messages).toEqual([
      { id: "delta", role: "user", content: "model only" },
    ]);
  });

  it("refreshes identity proof without changing delivery identity after a lost acknowledgement", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      if (requests.length === 1) throw new TypeError("lost acknowledgement");
      return receipt();
    }));
    const instance = client();
    let proofNumber = 0;
    instance.updateConfig({
      clientToken: "ct_test",
      identityProvider: "example",
      getIdentityProof: () => `one-use-proof-${++proofNumber}`,
    });

    await instance.dispatch({
      messages: [message("proof-retry")],
      steer: { turnId: "proof-retry", onAdmission: () => {} },
    }, () => {});

    expect(requests).toHaveLength(2);
    expect(requests.map(({ identityProof }) => identityProof)).toEqual([
      { provider: "example", token: "one-use-proof-1" },
      { provider: "example", token: "one-use-proof-2" },
    ]);
    const [{ identityProof: _firstProof, ...first }, { identityProof: _secondProof, ...second }] = requests;
    expect(second).toEqual(first);
    expect(second).toMatchObject({ turnId: "proof-retry", submitMode: "steer" });
  });

  it("releases definitely rejected payloads so later deliveries still post", async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      Response.json({ error: "incompatible" }, { status: 409 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const instance = client();
    for (let index = 0; index < 33; index++) {
      const id = `rejected-${index}`;
      await expect(instance.dispatch({
        messages: [message(id)],
        steer: { turnId: id, onAdmission: () => {} },
      }, () => {})).rejects.toMatchObject({ message: "incompatible", rejected: true });
    }
    fetcher.mockResolvedValueOnce(receipt());
    await instance.dispatch({
      messages: [message("valid")],
      steer: { turnId: "valid", onAdmission: () => {} },
    }, () => {});
    expect(fetcher).toHaveBeenCalledTimes(34);
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
          steer: { turnId: "delta", onAdmission: () => {} },
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
          steer: { turnId: "delta", onAdmission: () => {} },
        },
        () => {},
      ),
    ).rejects.toThrow("supported native");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a browser-supplied assistant transcript for steer", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      client().dispatch(
        {
          messages: [{ ...message("old"), role: "assistant" }],
          steer: { turnId: "delta", onAdmission: () => {} },
        },
        () => {},
      ),
    ).rejects.toThrow("new user messages only");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("does not attach or emit stream state after admission synchronously honors Stop", async () => {
  const pending = stream();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pending.response));
  const controller = new AbortController();
  const events: AgentWidgetEvent[] = [];
  await client().dispatch({
    messages: [message("stop-before-ack")],
    signal: controller.signal,
    steer: { turnId: "stop-before-ack", onAdmission: () => controller.abort() },
  }, (event) => events.push(event));
  expect(events).toEqual([]);
  expect(pending.response.body?.locked).toBe(false);
});
