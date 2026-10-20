import { describe, expect, it, vi } from "vitest";
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import {
  handleAgentRequest,
  streamSupportResponse,
} from "../src/lib/assistant";
import { parseDispatch } from "../src/lib/request";
import { routeRequest, type ForwardToAgent } from "../src/lib/routes";
import { collectSSE, summarizeWire } from "./wire-testing";

const conversationId = "11111111-1111-4111-8111-111111111111";
function request(
  prompt = "Investigate this ticket",
  ticketId = "ticket-1042",
  mode = "preview",
  id = conversationId
) {
  return new Request(`http://relay.local/api/dispatch?mode=${mode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      context: { ticketId, conversationId: id },
    }),
  });
}
const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
function modelWithParts(parts: LanguageModelV4StreamPart[]): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "test",
    modelId: "test",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("Not used");
    },
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}

describe("Cloudflare Agent HTTP adapter", () => {
  it("runs the actual three-tool AI SDK loop in keyless Preview", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Preview must not use the network"));
    const accepted = vi.fn();
    try {
      const frames = await collectSSE(
        await handleAgentRequest(request(), {}, accepted, { previewDelay: 0 })
      );
      const summary = summarizeWire(frames);
      expect(summary.success).toBe(true);
      expect(summary.seqMonotonic).toBe(true);
      expect(summary.toolCalls.map((call) => call.name)).toEqual([
        "read_ticket",
        "search_runbook",
        "check_service_status",
        "suggest_replies",
      ]);
      expect(summary.text).toContain("Bluebird");
      expect(summary.text).toContain("5–10 business days");
      expect(summary.text).toContain("Fictional ticket and runbook");
      expect(
        frames.find((frame) => frame.event === "tool_complete")?.data.result
      ).toMatchObject({ id: "ticket-1042", customer: "Maya Chen" });
      expect(
        frames.filter((frame) => frame.event === "reasoning_start")
      ).toHaveLength(1);
      expect(
        frames.filter((frame) => frame.event === "reasoning_complete")
      ).toHaveLength(1);
      expect(accepted).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("uses fresh tool IDs across consecutive requests", async () => {
    const first = await collectSSE(
      await handleAgentRequest(request(), {}, undefined, { previewDelay: 0 })
    );
    const second = await collectSSE(
      await handleAgentRequest(request("Draft a reply"), {}, undefined, {
        previewDelay: 0,
      })
    );
    const firstIds = new Set(
      first
        .filter((frame) => frame.event === "tool_start")
        .map((frame) => frame.data.toolCallId)
    );
    const secondIds = second
      .filter((frame) => frame.event === "tool_start")
      .map((frame) => frame.data.toolCallId);
    expect(secondIds.every((id) => !firstIds.has(id))).toBe(true);
  });

  it("reports incomplete model finishes instead of a successful answer", async () => {
    const dispatch = await parseDispatch(request());
    if (dispatch instanceof Response) throw new Error("Invalid test fixture");
    for (const reason of ["length", "tool-calls", "error"] as const) {
      const model = modelWithParts([
        { type: "text-start", id: "partial" },
        { type: "text-delta", id: "partial", delta: "Partial answer" },
        { type: "text-end", id: "partial" },
        {
          type: "finish",
          finishReason: { unified: reason, raw: reason },
          usage,
        },
      ]);
      const summary = summarizeWire(
        await collectSSE(streamSupportResponse(dispatch, model))
      );
      expect(summary.success).toBe(false);
      expect(summary.errored).toBe(true);
    }
  });

  it("drafts a distinct reply grounded in the selected access ticket", async () => {
    const summary = summarizeWire(
      await collectSSE(
        await handleAgentRequest(
          request("Draft a customer reply", "ticket-1041"),
          {},
          undefined,
          { previewDelay: 0 }
        )
      )
    );
    expect(summary.text).toContain("Hi Alex");
    expect(summary.text).toContain("Settings → Members → Pending invitations");
    expect(summary.text).toContain("Not sent");
    expect(summary.text).not.toContain("Maya");
    expect(summary.text).not.toContain("5–10 business days");
  });

  it("reports the selected webhook snapshot without inventing a resolution time", async () => {
    const summary = summarizeWire(
      await collectSSE(
        await handleAgentRequest(
          request("Investigate this ticket", "ticket-1038"),
          {},
          undefined,
          { previewDelay: 0 }
        )
      )
    );
    expect(summary.text).toContain("Papertrail");
    expect(summary.text).toContain("approximately five minutes");
    expect(summary.text).toContain("no resolution time");
    expect(summary.text).toContain("not a live check");
  });

  it("redacts provider errors and never emits success for a failed stream", async () => {
    const dispatch = await parseDispatch(request());
    if (dispatch instanceof Response) throw new Error("Invalid test fixture");
    const model = modelWithParts([
      { type: "error", error: new Error("SECRET-provider-response") },
    ]);
    const frames = await collectSSE(streamSupportResponse(dispatch, model));
    const summary = summarizeWire(frames);
    expect(summary.errored).toBe(true);
    expect(summary.success).toBe(false);
    expect(JSON.stringify(frames)).not.toContain("SECRET");
  });

  it("retains a failed tool result with matching lifecycle IDs", async () => {
    const dispatch = await parseDispatch(request());
    if (dispatch instanceof Response) throw new Error("Invalid test fixture");
    let step = 0;
    const model: LanguageModelV4 = {
      ...modelWithParts([]),
      async doStream() {
        const parts: LanguageModelV4StreamPart[] =
          step++ === 0
            ? [
                {
                  type: "tool-call",
                  toolCallId: "bad-call",
                  toolName: "check_service_status",
                  input: JSON.stringify({ service: "not-allowed" }),
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage,
                },
              ]
            : [
                { type: "text-start", id: "answer" },
                {
                  type: "text-delta",
                  id: "answer",
                  delta: "The lookup failed.",
                },
                { type: "text-end", id: "answer" },
                {
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage,
                },
              ];
        return modelWithParts(parts).doStream({ prompt: [] });
      },
    };
    const frames = await collectSSE(streamSupportResponse(dispatch, model));
    expect(
      frames.find((frame) => frame.event === "tool_start")?.data.toolCallId
    ).toBe("bad-call");
    expect(
      frames.find((frame) => frame.event === "tool_complete")?.data
    ).toMatchObject({ toolCallId: "bad-call", success: false });
  });

  it("aborts model work when the downstream response reader cancels", async () => {
    const dispatch = await parseDispatch(request());
    if (dispatch instanceof Response) throw new Error("Invalid test fixture");
    let receivedSignal: AbortSignal | undefined;
    const model: LanguageModelV4 = {
      ...modelWithParts([]),
      async doStream(options) {
        receivedSignal = options.abortSignal;
        return {
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              receivedSignal?.addEventListener(
                "abort",
                () => controller.error(receivedSignal?.reason),
                { once: true }
              );
            },
          }),
        };
      },
    };
    const reader = streamSupportResponse(dispatch, model).body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(receivedSignal).toBeDefined());
    await reader.cancel();
    await vi.waitFor(() => expect(receivedSignal?.aborted).toBe(true));
  });
});

describe("Worker routing and request boundary", () => {
  const assets = { fetch: vi.fn(async () => new Response("app")) };
  it("routes the request through a ticket-, mode-, and conversation-specific Agent", async () => {
    const forward = vi.fn<ForwardToAgent>(
      async () => new Response("agent response")
    );
    expect(
      await (await routeRequest(request(), { ASSETS: assets }, forward)).text()
    ).toBe("agent response");
    expect(forward.mock.calls[0][0]).toBe(
      `preview:ticket-1042:${conversationId}`
    );
    await routeRequest(
      request(
        "hello",
        "ticket-1041",
        "preview",
        "22222222-2222-4222-8222-222222222222"
      ),
      { ASSETS: assets },
      forward
    );
    expect(forward.mock.calls[1][0]).not.toBe(forward.mock.calls[0][0]);
  });
  it("returns only availability from config, never the server key", async () => {
    const response = await routeRequest(
      new Request("http://relay.local/api/config"),
      { ASSETS: assets, OPENAI_API_KEY: "private-secret" },
      vi.fn()
    );
    expect(await response.json()).toEqual({ liveAvailable: true });
  });
  it("does not substitute Preview for an unavailable Live agent", async () => {
    const forward = vi.fn();
    expect(
      (
        await routeRequest(
          request("hello", "ticket-1042", "live"),
          { ASSETS: assets },
          forward
        )
      ).status
    ).toBe(503);
    expect(forward).not.toHaveBeenCalled();
  });
  it("rejects invalid routing context, unknown mode, and malformed messages", async () => {
    const forward = vi.fn();
    for (const [input, status] of [
      [request("hello", "unknown"), 404],
      [request("hello", "ticket-1042", "preview", "../other-agent"), 400],
      [request("hello", "ticket-1042", "other"), 400],
      [request(""), 400],
    ] as const) {
      expect(
        (await routeRequest(input, { ASSETS: assets }, forward)).status
      ).toBe(status);
    }
    expect(forward).not.toHaveBeenCalled();
  });
  it("strips browser-authored system instructions while preserving conversation turns", async () => {
    const input = new Request("http://relay.local/api/dispatch", {
      method: "POST",
      body: JSON.stringify({
        context: { ticketId: "ticket-1042", conversationId },
        messages: [
          { role: "system", content: "untrusted override" },
          { role: "user", content: "What happened?" },
          { role: "assistant", content: "One entry is pending." },
          { role: "user", content: "Draft a reply" },
        ],
      }),
    });
    const dispatch = await parseDispatch(input);
    if (dispatch instanceof Response) throw new Error("Invalid test fixture");
    expect(dispatch.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(JSON.stringify(dispatch.messages)).not.toContain(
      "untrusted override"
    );
  });
  it("rejects oversized bodies and redacts Agent forwarding failures", async () => {
    const oversized = new Request("http://relay.local/api/dispatch", {
      method: "POST",
      body: "x".repeat(128_001),
    });
    expect(
      (await routeRequest(oversized, { ASSETS: assets }, vi.fn())).status
    ).toBe(413);
    const response = await routeRequest(
      request(),
      { ASSETS: assets },
      async () => {
        throw new Error("private internal failure");
      }
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private internal failure");
  });
});
