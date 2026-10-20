import { describe, expect, it } from "vitest";
import { createPreviewHandler, createResponsesPreviewHandler } from "../app/lib/preview";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

describe("keyless preview through real SDK adapters", () => {
  it.each([
    ["AI SDK", createPreviewHandler, 1],
    ["OpenAI Responses", createResponsesPreviewHandler, 0],
  ] as const)("keeps %s activity IDs distinct across requests and stable within each run", async (_name, createHandler, reasoningCount) => {
    const handle = createHandler({ delay: 0 });
    const seen = new Set<string>();
    for (let turn = 0; turn < 2; turn++) {
      const frames = await collectSSE(await handle(dispatchRequest("Build a launch checklist")));
      expect(summarizeWire(frames).success).toBe(true);
      for (const [start, delta, complete, key, count] of [
        ["reasoning_start", "reasoning_delta", "reasoning_complete", "id", reasoningCount],
        ["tool_start", null, "tool_complete", "toolCallId", 3],
      ] as const) {
        const ids = frames.filter(frame => frame.event === start).map(frame => String(frame.data[key]));
        expect(ids).toHaveLength(count);
        expect(new Set(ids).size).toBe(count);
        expect(frames.filter(frame => frame.event === complete).map(frame => String(frame.data[key]))).toEqual(ids);
        if (delta) {
          for (const frame of frames.filter(frame => frame.event === delta)) expect(ids).toContain(frame.data[key]);
        }
        for (const id of ids) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    }
  });

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
