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

// eve's model calls `agent/tools/suggest_replies.ts` and eve executes it, so the
// adapter only has to forward the call. The stubbed stream stands in for the
// model here: an offline run cannot make a real agent choose to call a tool.
const suggestRepliesAction = {
  kind: "tool-call",
  callId: "call_eve_1",
  toolName: "suggest_replies",
  input: {
    suggestions: [
      { label: "How does it stream?" },
      { label: "Show me the wire frames", prompt: "Show me the SSE frames you emit" },
    ],
  },
};

describe("eve adapter → follow-up suggestions", () => {
  const sessionWithSuggestions: EveSessionStream = async () =>
    (async function* () {
      yield { type: "message.appended", data: { messageDelta: "Sure." } };
      yield { type: "actions.requested", data: { actions: [suggestRepliesAction] } };
    })();

  it("emits suggest_replies after the text block and before the turn closes", async () => {
    const POST = createEvePersonaHandler({ getMessages, session: sessionWithSuggestions });

    const frames = await collectSSE(await POST(dispatchRequest("hi")));
    const events = frames.map((f) => f.event);
    const startIndex = events.indexOf("tool_start");

    expect(startIndex).toBeGreaterThan(events.indexOf("text_complete"));
    expect(startIndex).toBeLessThan(events.indexOf("turn_complete"));
    expect(frames[startIndex].data.toolName).toBe("suggest_replies");
    expect(frames[startIndex].data.toolType).toBe("local");
    // The widget reads `origin` on `await` frames only; omitting it always holds.
    expect(frames[startIndex].data.origin).toBeUndefined();
  });

  it("forwards eve's callId and closes the call fire-and-forget", async () => {
    const POST = createEvePersonaHandler({ getMessages, session: sessionWithSuggestions });

    const frames = await collectSSE(await POST(dispatchRequest("hi")));
    const startIndex = frames.findIndex((f) => f.event === "tool_start");
    const completeFrame = frames[startIndex + 1];

    expect(frames[startIndex].data.toolCallId).toBe("call_eve_1");
    expect(completeFrame.event).toBe("tool_complete");
    expect(completeFrame.data.toolCallId).toBe("call_eve_1");
    expect(completeFrame.data.success).toBe(true);
    // The canned result every Persona example puts on tool_complete.
    expect(completeFrame.data.result).toEqual({
      content: [{ type: "text", text: "Suggestions shown to the user." }],
    });
  });

  it("keeps the run well-formed and the payload within the widget's rules", async () => {
    const POST = createEvePersonaHandler({ getMessages, session: sessionWithSuggestions });

    const summary = summarizeWire(await collectSSE(await POST(dispatchRequest("hi"))));

    expect(summary.text).toBe("Sure.");
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

  it("ignores non-tool-call actions", async () => {
    const POST = createEvePersonaHandler({
      getMessages,
      session: async () =>
        (async function* () {
          yield { type: "message.appended", data: { messageDelta: "Delegating." } };
          yield {
            type: "actions.requested",
            data: { actions: [{ kind: "subagent-call", callId: "call_sub", input: {} }] },
          };
        })(),
    });

    const summary = summarizeWire(await collectSSE(await POST(dispatchRequest("hi"))));

    expect(summary.toolCalls).toEqual([]);
    expect(summary.success).toBe(true);
  });
});
