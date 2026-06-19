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
