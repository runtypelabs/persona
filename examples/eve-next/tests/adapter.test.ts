import { describe, expect, it } from "vitest";
import { createEvePersonaHandler, type EveSessionStream } from "../app/lib/eve-adapter";
import { personaMessagesToChat, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// Mock LLM: a fake eve session stream that yields the framework's own event
// shapes: `message.appended` events carrying an incremental `messageDelta`.
// No running eve server, no model key.
const mockSession =
  (parts: string[]): EveSessionStream =>
  async () =>
    (async function* () {
      for (const part of parts) {
        yield { type: "message.appended", data: { messageDelta: part } };
      }
    })();

const getMessages = (body: unknown) =>
  personaMessagesToChat((body as PersonaDispatchBody).messages);

describe("eve adapter → Persona wire", () => {
  it("translates eve message deltas into a valid SSE run", async () => {
    const POST = createEvePersonaHandler({
      getMessages,
      session: mockSession(["Hello", ", ", "world"]),
    });

    const summary = summarizeWire(await collectSSE(await POST(dispatchRequest("hi"))));

    expect(summary.events[0]).toBe("execution_start");
    expect(summary.events.at(-1)).toBe("execution_complete");
    expect(summary.text).toBe("Hello, world");
    expect(summary.executionIds.size).toBe(1);
    expect(summary.kinds.has("agent")).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
  });

  it("surfaces a mid-stream failure as execution_error", async () => {
    const failing: EveSessionStream = async () =>
      (async function* () {
        yield { type: "message.appended", data: { messageDelta: "partial" } };
        throw new Error("boom");
      })();

    const POST = createEvePersonaHandler({ getMessages, session: failing });
    const summary = summarizeWire(await collectSSE(await POST(dispatchRequest("hi"))));

    expect(summary.errored).toBe(true);
    expect(summary.success).toBe(false);
  });
});
