import { describe, it, expect } from "vitest";
import { AgentWidgetSession } from "./session";
import type {
  AgentWidgetMessage,
  AgentWidgetRequestPayload,
  ContentPart,
} from "./types";
import type { MentionSubmitBundle } from "./context-mentions-entry";

/** A closed, empty SSE stream so `dispatch` completes with no events. */
function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({ start: (c) => c.close() });
}

/**
 * Regression coverage for the mention/command submit path:
 * - an empty-text, chip-only submit must NOT render the "[Image]" fallback
 *   (that fallback is for image-only turns);
 * - a `command: "server"` mention's `resolve().context` must ride to the
 *   backend under request `context.mentions` (the c1 dispatch channel).
 */
describe("AgentWidgetSession — mention/command submit", () => {
  function makeSession(captured: { payload?: AgentWidgetRequestPayload }) {
    let messages: AgentWidgetMessage[] = [];
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://localhost:8000",
        customFetch: async (_url, _init, payload) => {
          captured.payload = payload;
          return { ok: true, body: closedStream() } as unknown as Response;
        },
      },
      {
        onMessagesChanged: (m) => {
          messages = m;
        },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onError: () => {},
      }
    );
    return {
      session,
      user: () => messages.find((m) => m.role === "user"),
    };
  }

  it("renders no [Image] fallback for a command-only submit and forwards context.mentions", async () => {
    const captured: { payload?: AgentWidgetRequestPayload } = {};
    const { session, user } = makeSession(captured);

    // A server skill: `/lookup 1042` resolved to structured context, namespaced
    // `{ [sourceId]: { [itemId]: context } }` exactly as the manager builds it.
    const context = { commands: { lookup: { intent: "lookup-order", orderId: "1042" } } };
    const bundle: MentionSubmitBundle = {
      refs: [{ sourceId: "commands", itemId: "lookup", label: "lookup" }],
      llmEntries: [],
      contentParts: [],
      context,
    };

    await session.sendMessage("", {
      mentions: {
        refs: bundle.refs,
        finalize: async () => bundle,
      },
    });

    const msg = user();
    expect(msg).toBeDefined();
    // The bug: an empty-text, mention-only submit used to display "[Image]".
    expect(msg!.content).toBe("");
    expect(msg!.content).not.toBe("[Image]");
    // The command chip echoes immediately as a ref.
    expect(msg!.contextMentions).toEqual(bundle.refs);
    // Structured server-command data is merged onto the message…
    expect(msg!.mentionContext).toEqual(context);
    // …and rides to the backend under request `context.mentions`.
    expect(captured.payload?.context).toMatchObject({ mentions: context });
  });

  it("merges resolved @-mention llmContent into the dispatched snapshot", async () => {
    const captured: { payload?: AgentWidgetRequestPayload } = {};
    const { session } = makeSession(captured);

    await session.sendMessage("summarize this", {
      mentions: {
        refs: [{ sourceId: "files", itemId: "app", label: "App.tsx" }],
        finalize: async (): Promise<MentionSubmitBundle> => ({
          refs: [{ sourceId: "files", itemId: "app", label: "App.tsx" }],
          llmEntries: [{ label: "App.tsx", text: "FILE BODY" }],
          contentParts: [],
          context: {},
        }),
      },
    });

    const dispatched = (captured.payload?.messages ?? []).find(
      (m) => m.role === "user"
    );
    // The client collapses `llmContent` into the payload `content` field via the
    // content-priority chain, so the model must see the resolved file body
    // appended to the typed prose — not just the raw "summarize this".
    const sent = dispatched?.content;
    expect(typeof sent).toBe("string");
    expect(sent as string).toContain("FILE BODY");
    expect(sent as string).toContain("summarize this");
  });

  it("still renders the [Image] fallback for an image-only submit", async () => {
    const captured: { payload?: AgentWidgetRequestPayload } = {};
    const { session, user } = makeSession(captured);

    const contentParts: ContentPart[] = [
      { type: "image", image: "data:image/png;base64,abc123", mimeType: "image/png" },
    ];
    await session.sendMessage("", { contentParts });

    expect(user()!.content).toBe("[Image]");
  });
});
