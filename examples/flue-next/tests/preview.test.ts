import { describe, expect, it } from "vitest";
import { previewResponse } from "../app/lib/preview";
import { collectSSE, summarizeWire } from "./wire-testing";

describe("Flue preview activity", () => {
  it("keeps activity IDs distinct across requests and stable across projected snapshots", async () => {
    const seen = new Set<string>();
    for (let turn = 0; turn < 2; turn++) {
      const frames = await collectSSE(previewResponse("Check release readiness", "october"));
      expect(summarizeWire(frames).success).toBe(true);
      for (const [start, delta, complete, key, count] of [
        ["reasoning_start", "reasoning_delta", "reasoning_complete", "id", 1],
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
});
