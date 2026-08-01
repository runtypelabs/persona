import { describe, expect, it } from "vitest";
import { createEchoPersonaHandler } from "../src/lib/echo-adapter";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// These tests exercise the canonical adapter directly, with no Hono, no server, and no
// network. The handler is a plain `(Request) => Promise<Response>`, so the same
// assertions hold no matter which host mounts it.
describe("echo adapter → Persona wire", () => {
  it("streams a valid SSE run from the default echo agent", async () => {
    const handle = createEchoPersonaHandler();

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi there"))));

    expect(summary.events[0]).toBe("execution_start");
    expect(summary.events.at(-1)).toBe("execution_complete");
    expect(summary.text).toContain('You said: "hi there"');
    expect(summary.executionIds.size).toBe(1);
    expect(summary.kinds.has("agent")).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
  });

  it("re-hosts identically: a custom responder controls the streamed text", async () => {
    const handle = createEchoPersonaHandler({
      respond: async function* () {
        yield "Hello";
        yield ", ";
        yield "world";
      },
    });

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi"))));

    expect(summary.text).toBe("Hello, world");
    expect(summary.success).toBe(true);
  });

  it("surfaces a mid-stream responder failure as execution_error", async () => {
    const handle = createEchoPersonaHandler({
      respond: async function* () {
        yield "partial";
        throw new Error("boom");
      },
    });

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi"))));

    expect(summary.errored).toBe(true);
    expect(summary.success).toBe(false);
  });
});

// The follow-up chips are pure wire: a fire-and-forget `suggest_replies` tool
// call, no `/resume` endpoint and no widget config.
describe("echo adapter → follow-up suggestions", () => {
  it("emits suggest_replies after the text block and before the turn closes", async () => {
    const handle = createEchoPersonaHandler();

    const frames = await collectSSE(await handle(dispatchRequest("hi")));
    const events = frames.map((f) => f.event);
    const startIndex = events.indexOf("tool_start");

    expect(startIndex).toBeGreaterThan(events.indexOf("text_complete"));
    expect(startIndex).toBeLessThan(events.indexOf("turn_complete"));
    expect(frames[startIndex].data.toolName).toBe("suggest_replies");
    expect(frames[startIndex].data.toolType).toBe("local");
    // The widget reads `origin` on `await` frames only; omitting it always holds.
    expect(frames[startIndex].data.origin).toBeUndefined();
  });

  it("closes the tool call with a matching toolCallId", async () => {
    const handle = createEchoPersonaHandler();

    const frames = await collectSSE(await handle(dispatchRequest("hi")));
    const startIndex = frames.findIndex((f) => f.event === "tool_start");
    const completeFrame = frames[startIndex + 1];

    expect(completeFrame.event).toBe("tool_complete");
    expect(completeFrame.data.toolCallId).toBe(frames[startIndex].data.toolCallId);
    expect(String(frames[startIndex].data.toolCallId)).toMatch(/^call_/);
    expect(completeFrame.data.success).toBe(true);
  });

  it("keeps the run well-formed and the payload within the widget's rules", async () => {
    const handle = createEchoPersonaHandler();

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi"))));

    expect(summary.executionIds.size).toBe(1);
    expect(summary.seqMonotonic).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.toolCalls.map((call) => call.name)).toEqual(["suggest_replies"]);

    const { suggestions } = summary.toolCalls[0].parameters as { suggestions: unknown[] };
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.length).toBeLessThanOrEqual(4);
    for (const item of suggestions) {
      if (typeof item === "string") {
        expect(item.length).toBeGreaterThan(0);
      } else {
        expect(typeof (item as { label?: unknown }).label).toBe("string");
      }
    }
  });
});
