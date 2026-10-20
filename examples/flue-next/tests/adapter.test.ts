import { describe, expect, it, vi } from "vitest";
import { createFlueClient } from "@flue/sdk";
vi.mock("@flue/sdk", () => ({ createFlueClient: vi.fn() }));
import type {
  FlueClient,
  FlueConversationMessage,
  FlueConversationPart,
} from "@flue/sdk";
import {
  createConversationProjector,
  streamFlueConversation,
} from "../app/lib/flue-adapter";
import { createPersonaSSEStream } from "../app/lib/persona-wire";
import { POST } from "../app/api/flue/dispatch/route";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

const message = (
  parts: FlueConversationPart[],
  extra: Partial<FlueConversationMessage> = {}
): FlueConversationMessage => ({
  id: "reply",
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  submissionId: "submission",
  parts,
  ...extra,
});

describe("Flue materialized conversation adapter", () => {
  it("streams only appended text and deduplicates reconnect snapshots", async () => {
    const response = createPersonaSSEStream(({ emit }) => {
      const projector = createConversationProjector(emit, "submission");
      projector.project([
        message([{ type: "text", text: "Hello", state: "streaming" }]),
      ]);
      projector.project([
        message([{ type: "text", text: "Hello", state: "streaming" }]),
      ]);
      projector.project([
        message([{ type: "text", text: "Hello world", state: "done" }]),
      ]);
      projector.project([
        message([{ type: "text", text: "Private", state: "done" }], {
          display: "hidden",
        }),
      ]);
      projector.project([
        message([{ type: "text", text: "Old conversation", state: "done" }], {
          submissionId: "old",
        }),
      ]);
    });
    const result = summarizeWire(await collectSSE(response));
    expect(result.text).toBe("Hello world");
    expect(result.success).toBe(true);
    expect(result.seqMonotonic).toBe(true);
  });

  it("projects actual reasoning parts separately and completes them once", async () => {
    const response = createPersonaSSEStream(({ emit }) => {
      const projector = createConversationProjector(emit, "submission");
      projector.project([
        message([{ type: "reasoning", text: "Check", state: "streaming" }]),
      ]);
      projector.project([
        message([{ type: "reasoning", text: "Check release", state: "done" }]),
      ]);
      projector.project([
        message([{ type: "reasoning", text: "Check release", state: "done" }]),
      ]);
      projector.project([
        message([
          { type: "reasoning", text: "Check release", state: "done" },
          { type: "text", text: "Two checks remain.", state: "done" },
        ]),
      ]);
    });
    const frames = await collectSSE(response);
    expect(
      frames.filter((frame) => frame.event === "reasoning_start")
    ).toHaveLength(1);
    expect(
      frames.filter((frame) => frame.event === "reasoning_complete")
    ).toHaveLength(1);
    expect(
      frames
        .filter((frame) => frame.event === "reasoning_delta")
        .map((frame) => frame.data.delta)
        .join("")
    ).toBe("Check release");
    expect(summarizeWire(frames).text).toBe("Two checks remain.");
  });

  it("preserves pending tool lifecycle, output, ids and failures without duplication", async () => {
    const response = createPersonaSSEStream(({ emit }) => {
      const projector = createConversationProjector(emit, "submission");
      const tool = {
        type: "dynamic-tool" as const,
        toolName: "inspect_release",
        toolCallId: "call-1",
        input: { release: "october" },
      };
      projector.project([message([{ ...tool, state: "input-available" }])]);
      const snapshot = message([
        { ...tool, state: "output-available", output: { ready: true } },
      ]);
      projector.project([snapshot]);
      projector.project([snapshot]);
      projector.project([
        message([
          {
            ...tool,
            toolCallId: "call-2",
            state: "output-error",
            errorText: "Check unavailable",
          },
        ]),
      ]);
    });
    const frames = await collectSSE(response);
    const starts = frames.filter((frame) => frame.event === "tool_start");
    const finishes = frames.filter((frame) => frame.event === "tool_complete");
    expect(starts).toHaveLength(2);
    expect(finishes).toHaveLength(2);
    expect(finishes[0].data).toMatchObject({
      toolCallId: "call-1",
      success: true,
      result: { ready: true },
    });
    expect(finishes[1].data).toMatchObject({
      toolCallId: "call-2",
      success: false,
      result: { error: "Check unavailable" },
    });
  });

  it("reads a submission, flushes final tools, and closes the observer", async () => {
    const close = vi.fn();
    const unsubscribe = vi.fn();
    const client: Pick<FlueClient, "send" | "read" | "observe" | "history"> = {
      send: vi.fn(async () => ({
        submissionId: "submission",
        uid: "uid",
        offset: "0",
        streamUrl: "http://flue/updates",
      })),
      read: vi.fn(async () => ({
        submissionId: "submission",
        text: "Ready.",
        data: {},
      })),
      history: vi.fn(async () => ({
        v: 1 as const,
        conversationId: "conversation",
        offset: "1",
        settlements: [],
        messages: [message([{ type: "text", text: "Ready.", state: "done" }])],
      })),
      observe: () => ({
        subscribe: () => unsubscribe,
        close,
        refresh() {},
        getSnapshot: () => ({
          phase: "loading",
          conversation: undefined,
          offset: undefined,
          error: undefined,
        }),
      }),
    };
    const result = summarizeWire(
      await collectSSE(streamFlueConversation(client, "Check it"))
    );
    expect(result.text).toBe("Ready.");
    expect(result.success).toBe(true);
    expect(client.send).toHaveBeenCalledWith({
      message: { kind: "user", body: "Check it" },
      signal: expect.any(AbortSignal),
    });
    expect(close).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("closes the observer and cancels a pending read when the response reader disconnects", async () => {
    const close = vi.fn();
    const unsubscribe = vi.fn();
    let receivedSignal: AbortSignal | undefined;
    const client: Pick<FlueClient, "send" | "read" | "observe" | "history"> = {
      send: async () => ({
        submissionId: "submission",
        uid: "uid",
        offset: "0",
        streamUrl: "http://flue/updates",
      }),
      read: vi.fn<FlueClient["read"]>(
        (_admission, options) =>
          new Promise<Awaited<ReturnType<FlueClient["read"]>>>(
            (_resolve, reject) => {
              receivedSignal = options?.signal;
              receivedSignal?.addEventListener(
                "abort",
                () => reject(receivedSignal?.reason),
                { once: true }
              );
            }
          )
      ),
      history: vi.fn(),
      observe: () => ({
        subscribe: () => unsubscribe,
        close,
        refresh() {},
        getSnapshot: () => ({
          phase: "loading",
          conversation: undefined,
          offset: undefined,
          error: undefined,
        }),
      }),
    };
    const reader = streamFlueConversation(client, "Check it").body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(client.read).toHaveBeenCalledOnce());
    await reader.cancel();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(receivedSignal?.aborted).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(client.history).not.toHaveBeenCalled();
  });

  it("turns provider failures into a redacted terminal error", async () => {
    const client = {
      send: vi.fn(async () => {
        throw new Error("Bearer private-provider-secret");
      }),
      read: vi.fn(),
      observe: vi.fn(),
      history: vi.fn(),
    };
    const frames = await collectSSE(streamFlueConversation(client, "Check it"));
    expect(summarizeWire(frames).errored).toBe(true);
    expect(summarizeWire(frames).success).toBe(false);
    expect(JSON.stringify(frames)).not.toContain("private-provider-secret");
  });
});

describe("dispatch route", () => {
  it("previews a multi-tool release review with no credentials", async () => {
    const result = summarizeWire(
      await collectSSE(await POST(dispatchRequest("Check launch readiness")))
    );
    expect(result.text).toContain("Two small steps before launch");
    expect(result.text).toContain("Preview response");
    expect(result.toolCalls.map((tool) => tool.name)).toEqual([
      "inspect_release",
      "read_changes",
      "suggest_replies",
    ]);
    expect(result.success).toBe(true);
  });
  it("uses selected release context and requested draft in preview", async () => {
    const request = new Request("http://test.local/api/flue/dispatch", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Draft release notes" }],
        context: { release: "september" },
      }),
    });
    const result = summarizeWire(await collectSSE(await POST(request)));
    expect(result.text).toContain("Introducing Orbit 2.7");
    expect(result.text).toContain("all four readiness checks");
  });
  it("answers change-row and summary actions from their selected release data", async () => {
    const row = summarizeWire(
      await collectSSE(await POST(dispatchRequest("Explain ORB-279")))
    );
    expect(row.text).toContain("Leo Park");
    expect(row.text).toContain(
      "does not include a detailed implementation description"
    );
    const summary = summarizeWire(
      await collectSSE(await POST(dispatchRequest("Summarize the changes")))
    );
    expect(summary.text).toContain("What’s in Orbit 2.8");
    expect(summary.text).toContain("Noah James");
  });

  it("rejects malformed requests before opening a stream", async () => {
    const request = new Request("http://test.local", {
      method: "POST",
      body: "not-json",
    });
    expect((await POST(request)).status).toBe(400);
    expect((await POST(dispatchRequest(""))).status).toBe(400);
  });
  it("stops Preview generation when its request is aborted", async () => {
    const abort = new AbortController();
    const request = new Request(dispatchRequest("Check launch readiness"), {
      signal: abort.signal,
    });
    const response = await POST(request);
    abort.abort();
    const result = summarizeWire(await collectSSE(response));
    expect(result.success).toBe(false);
    expect(
      result.toolCalls.some((tool) => tool.name === "suggest_replies")
    ).toBe(false);
  });

  it("scopes Live history to a signed session and validated frontend conversation", async () => {
    vi.stubEnv("FLUE_AGENT_URL", "http://flue.test/agents/releases");
    vi.stubEnv("FLUE_TOKEN", "test-only-secret");
    const client: FlueClient = {
      url: "http://flue.test",
      send: async () => {
        throw new Error("Stop before network");
      },
      read: vi.fn(),
      observe: vi.fn(),
      history: vi.fn(),
      abort: vi.fn(),
      attachmentUrl: vi.fn(),
      wait: vi.fn(),
      historyBefore: vi.fn(),
    };
    vi.mocked(createFlueClient).mockReturnValue(client);
    const request = (conversationId: string, cookie = "") =>
      new Request("http://test.local/api/flue/dispatch?mode=live", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Check release" }],
          context: { conversationId, release: "october" },
        }),
      });
    try {
      const firstId = "11111111-1111-4111-8111-111111111111";
      const first = await POST(request(firstId));
      const cookie = first.headers.get("set-cookie")!.split(";")[0];
      await first.text();
      const firstUrl = vi.mocked(createFlueClient).mock.calls.at(-1)![0].url;
      await (await POST(request(firstId, cookie))).text();
      expect(vi.mocked(createFlueClient).mock.calls.at(-1)![0].url).toBe(
        firstUrl
      );
      await (
        await POST(request("22222222-2222-4222-8222-222222222222", cookie))
      ).text();
      expect(vi.mocked(createFlueClient).mock.calls.at(-1)![0].url).not.toBe(
        firstUrl
      );
      expect(
        (await POST(request("../../another-conversation", cookie))).status
      ).toBe(400);
      expect(firstUrl).not.toContain(firstId);
    } finally {
      vi.unstubAllEnvs();
      vi.mocked(createFlueClient).mockReset();
    }
  });

  it("does not silently substitute preview when Live is unavailable", async () => {
    vi.stubEnv("FLUE_AGENT_URL", "");
    vi.stubEnv("FLUE_TOKEN", "");
    try {
      const request = new Request(
        "http://test.local/api/flue/dispatch?mode=live",
        {
          method: "POST",
          body: JSON.stringify({
            messages: [{ role: "user", content: "hello" }],
          }),
        }
      );
      expect((await POST(request)).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
