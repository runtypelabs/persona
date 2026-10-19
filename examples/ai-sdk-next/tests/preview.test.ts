import { describe, expect, it } from "vitest";
import { createPreviewHandler, createResponsesPreviewHandler } from "../app/lib/preview";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

describe("keyless preview through real SDK adapters", () => {
  it("runs three AI SDK tools before streaming the final answer", async () => {
    const frames = await collectSSE(await createPreviewHandler({ delay: 0 })(dispatchRequest("Research a thoughtful product launch")));
    const summary = summarizeWire(frames);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
    expect(summary.toolCalls.map(call => call.name)).toEqual(["search_docs", "read_document", "check_readiness"]);
    expect(frames.filter(frame => frame.event === "tool_complete")).toHaveLength(3);
    expect(frames.findIndex(frame => frame.event === "reasoning_start")).toBeLessThan(frames.findIndex(frame => frame.event === "tool_start"));
    expect(frames.findIndex(frame => frame.event === "text_start")).toBeGreaterThan(frames.map(frame => frame.event).lastIndexOf("tool_complete"));
    expect(summary.text).toContain("Start with a smaller, better launch");
    expect(summary.text).toContain("no live research was performed");
  });

  it("produces the requested preview scenario rather than an identical response", async () => {
    const handle = createPreviewHandler({ delay: 0 });
    const checklist = summarizeWire(await collectSSE(await handle(dispatchRequest("Build a launch checklist"))));
    const comparison = summarizeWire(await collectSSE(await handle(dispatchRequest("Compare three launch strategies"))));
    expect(checklist.text).toContain("Before launch");
    expect(comparison.text).toContain("Trade-off");
    expect(checklist.text).not.toBe(comparison.text);
  });

  it("keeps OpenAI preview commentary separate from the final answer with three completed tools", async () => {
    const frames = await collectSSE(await createResponsesPreviewHandler({ delay: 0 })(dispatchRequest("Compare launch strategies")));
    const summary = summarizeWire(frames);
    expect(summary.success).toBe(true);
    expect(summary.toolCalls.map(call => call.name)).toEqual(["web_search", "web_search", "web_search"]);
    expect(frames.filter(frame => frame.event === "text_start").map(frame => frame.data.phase)).toEqual(["commentary", "final_answer"]);
    expect(frames.filter(frame => frame.event === "tool_complete")).toHaveLength(3);
    expect(summary.text).toContain("Three ways");
  });

  it("terminates an already cancelled preview without a successful completion", async () => {
    const controller = new AbortController();
    const request = new Request("http://localhost/api/preview/dispatch", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "Launch plan" }] }) });
    controller.abort();
    const summary = summarizeWire(await collectSSE(await createPreviewHandler({ delay: 0 })(request)));
    expect(summary.success).toBe(false);
    expect(summary.errored).toBe(true);
  });
});
