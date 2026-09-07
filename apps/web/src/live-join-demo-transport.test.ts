import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveJoinDemoTransport,
  LIVE_JOIN_DEMO_ORIGIN as origin,
} from "./live-join-demo-transport";
let demo: ReturnType<typeof createLiveJoinDemoTransport>;
afterEach(() => {
  demo?.dispose();
  vi.useRealTimers();
});
const send = (id: string, content = id) =>
  demo.fetch(`${origin}/v1/client/chat`, {
    method: "POST",
    body: JSON.stringify({
      submitMode: "join",
      turnId: id,
      messages: [{ id, role: "user", content }],
    }),
  });
const status = (execution: string, delivery: string) =>
  demo
    .fetch(
      `${origin}/v1/client/conversations/record_live_join_demo/executions/${execution}/deliveries/${delivery}`,
    )
    .then((response) => response.json());
describe("live join teaching transport", () => {
  it("keeps one execution and settles every joined input in its streamed response", async () => {
    vi.useFakeTimers();
    demo = createLiveJoinDemoTransport({ delayMs: 8000 });
    const first = await send("first");
    const output = first.text();
    const joined = await send("second");
    expect(joined.status).toBe(202);
    const receipt = await joined.json();
    expect(receipt.executionId).toBe(
      first.headers.get("X-Runtype-Execution-Id"),
    );
    expect(receipt.deliveryStatus).toBe("pending");
    await vi.runAllTimersAsync();
    const frames = (await output)
      .split("\n\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line.slice(6)));
    expect(
      frames
        .filter((frame) => frame.type === "text_delta")
        .map((frame) => frame.delta)
        .join(""),
    ).toContain("second");
    expect(frames.filter((frame) => frame.type === "tool_start")).toHaveLength(
      1,
    );
    expect((await status(receipt.executionId, receipt.deliveryId)).status).toBe(
      "settled",
    );
  });
  it("deduplicates a lost acknowledgement and rejects changed content", async () => {
    demo = createLiveJoinDemoTransport();
    await send("first");
    demo.loseNextAcknowledgement();
    await expect(send("second")).rejects.toThrow("lost acknowledgement");
    const retry = await (await send("second")).json();
    expect(retry.executionId).toBe("demo-execution-1");
    expect(retry.deliveryId).toBe("delivery-second");
    expect((await send("second", "changed")).status).toBe(409);
  });
  it("stops the host, marks pending input not applied, and admits a new execution", async () => {
    demo = createLiveJoinDemoTransport();
    await send("first");
    const joined = await (await send("second")).json();
    const cancelled = await demo.fetch(
      `${origin}/v1/client/conversations/record_live_join_demo/executions/${joined.executionId}/cancel`,
      { method: "POST" },
    );
    expect(cancelled.status).toBe(202);
    expect((await status(joined.executionId, joined.deliveryId)).status).toBe(
      "not_applied",
    );
    expect((await send("third")).headers.get("X-Runtype-Execution-Id")).toBe(
      "demo-execution-2",
    );
  });
  it("never handles other origins or unsupported request modes", async () => {
    demo = createLiveJoinDemoTransport();
    await expect(demo.fetch("https://example.com")).rejects.toThrow(
      "Not a demo request",
    );
    expect(
      (
        await demo.fetch(`${origin}/v1/client/chat`, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(400);
  });
});
