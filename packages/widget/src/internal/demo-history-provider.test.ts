import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
  type DemoHistoryProvider,
} from "./demo-history-provider";
import {
  HistoryProviderError,
  isHistoryProviderError,
  type HistoryOperationContext,
} from "./history-provider";
import { isHistoryDisplayUnavailable } from "../utils/history-messages";

const FIXED_NOW = Date.parse("2026-08-10T12:00:00.000Z");
const now = () => FIXED_NOW;
const browser: HistoryOperationContext = { scope: "browser" };
const verified: HistoryOperationContext = { scope: "verified-user" };

function provider(
  options: Parameters<typeof createDemoHistoryProvider>[0] = {}
): DemoHistoryProvider {
  return createDemoHistoryProvider({ now, ...options });
}

function seedWith(messageCount: number): DemoHistoryConversationSeed[] {
  return [
    {
      id: "c1",
      title: "Paging",
      targetId: "t1",
      messages: Array.from({ length: messageCount }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `m${index + 1}`,
        createdAt: new Date(FIXED_NOW - (messageCount - index) * 1000).toISOString(),
      })),
    },
  ];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("capabilities", () => {
  it("advertises browser scope only and omits the optional capabilities", () => {
    const demo = provider();
    expect(demo.capabilities.scopes).toEqual(["browser"]);
    expect(demo.resetDevice).toBeUndefined();
    expect(demo.subscribeAvailability).toBeUndefined();
  });

  it("rejects an unsupported scope locally", async () => {
    const demo = provider();
    await expect(demo.list({ context: verified })).rejects.toMatchObject({
      code: "unsupported_scope",
    });
  });
});

describe("transcript paging", () => {
  it("returns 25 / 25 / rest newest-page-first with oldest-first pages", async () => {
    const demo = provider({ conversations: seedWith(52) });

    const first = await demo.getPage("c1", { context: browser });
    expect(first.messages).toHaveLength(25);
    expect(first.messages[0].content).toBe("m28");
    expect(first.messages[24].content).toBe("m52");
    expect(first.nextCursor).not.toBeNull();
    expect(first.summary.messageCount).toBe(52);
    expect(first.conversationRevision).toBe(demo.getConversationRevision("c1"));

    const second = await demo.getPage("c1", {
      context: browser,
      cursor: first.nextCursor as string,
    });
    expect(second.messages).toHaveLength(25);
    expect(second.messages[0].content).toBe("m3");
    expect(second.messages[24].content).toBe("m27");
    expect(second.nextCursor).not.toBeNull();

    const third = await demo.getPage("c1", {
      context: browser,
      cursor: second.nextCursor as string,
    });
    expect(third.messages.map((m) => m.content)).toEqual(["m1", "m2"]);
    expect(third.nextCursor).toBeNull();
  });

  it("keeps a single page when the transcript fits and is stable across calls", async () => {
    const demo = provider({ conversations: seedWith(7) });
    const first = await demo.getPage("c1", { context: browser });
    const again = await demo.getPage("c1", { context: browser });
    expect(first.nextCursor).toBeNull();
    expect(first.messages.map((m) => m.id)).toEqual(again.messages.map((m) => m.id));
    expect(first.messages.map((m) => m.content)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
    ]);
  });

  it("rejects an unknown conversation with not_found", async () => {
    const demo = provider();
    const error = await demo
      .getPage("nope", { context: browser })
      .catch((err: unknown) => err);
    expect(isHistoryProviderError(error)).toBe(true);
    expect((error as HistoryProviderError).code).toBe("not_found");
  });

  it("returns already-mapped messages including parts and the unavailable marker", async () => {
    const demo = provider();
    const refund = await demo.getPage("demo-conv-damaged-mug", { context: browser });
    const oldest = await demo.getPage("demo-conv-damaged-mug", {
      context: browser,
      cursor: refund.nextCursor as string,
    });
    expect(oldest.messages[0].contentParts?.[1]?.type).toBe("image");
    expect(oldest.messages[1].contentParts?.[1]?.type).toBe("file");

    const bulk = await demo.getPage("demo-conv-bulk-order", { context: browser });
    const withheld = bulk.messages.filter(isHistoryDisplayUnavailable);
    expect(withheld).toHaveLength(1);
    expect(withheld[0].content).toBe("");
  });
});

describe("list paging", () => {
  it("chains cursors in updatedAt-descending order", async () => {
    const demo = provider();
    const all = demo.getConversationIds();

    const first = await demo.list({ context: browser, limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(all.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();

    const second = await demo.list({
      context: browser,
      limit: 2,
      cursor: first.nextCursor as string,
    });
    expect(second.items.map((item) => item.id)).toEqual(all.slice(2, 4));

    const third = await demo.list({
      context: browser,
      limit: 2,
      cursor: second.nextCursor as string,
    });
    expect(third.items.map((item) => item.id)).toEqual(all.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it("filters by targetId and carries previews plus message counts", async () => {
    const demo = provider();
    const filtered = await demo.list({ context: browser, targetId: "demo-support-agent" });
    expect(filtered.items.map((item) => item.id)).toEqual(["demo-conv-gift-wrap"]);
    expect(filtered.items[0].messageCount).toBe(2);
    expect(filtered.items[0].preview).toBeTruthy();
    expect(filtered.items[0].preview?.length).toBeLessThanOrEqual(140);
  });
});

describe("delete semantics", () => {
  it("delete removes exactly one conversation", async () => {
    const demo = provider();
    const before = demo.getConversationIds();
    await demo.delete("demo-conv-bulk-order", { context: browser });
    expect(demo.getConversationIds()).toEqual(
      before.filter((id) => id !== "demo-conv-bulk-order")
    );
    await expect(
      demo.delete("demo-conv-bulk-order", { context: browser })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("deleteAll respects the targetId filter", async () => {
    const demo = provider();
    const result = await demo.deleteAll({ context: browser, targetId: "demo-flow" });
    expect(result.deleted).toBe(4);
    expect(demo.getConversationIds()).toEqual(["demo-conv-gift-wrap"]);
  });

  it("deleteAll without a targetId clears the whole scope", async () => {
    const demo = provider();
    const result = await demo.deleteAll({ context: browser });
    expect(result.deleted).toBe(5);
    expect(demo.getConversationIds()).toEqual([]);
  });

  it("deleting the active conversation clears the active id", async () => {
    const demo = provider();
    const prepared = await demo.prepareOpen("demo-conv-order-status", { context: browser });
    await prepared.commit();
    await demo.delete("demo-conv-order-status", { context: browser });
    expect(demo.getActiveConversationId()).toBeNull();
  });
});

describe("prepared activations", () => {
  it("prepareOpen changes nothing until commit", async () => {
    const demo = provider();
    const prepared = await demo.prepareOpen("demo-conv-bulk-order", { context: browser });
    expect(prepared.conversationId).toBe("demo-conv-bulk-order");
    expect(prepared.conversationRevision).toBe(
      demo.getConversationRevision("demo-conv-bulk-order")
    );
    expect(demo.getActiveConversationId()).toBeNull();

    await prepared.commit();
    expect(demo.getActiveConversationId()).toBe("demo-conv-bulk-order");
  });

  it("discard is inert and wins over a later commit", async () => {
    const demo = provider();
    const first = await demo.prepareOpen("demo-conv-bulk-order", { context: browser });
    const second = await demo.prepareOpen("demo-conv-gift-wrap", { context: browser });

    first.discard();
    first.discard();
    expect(demo.getActiveConversationId()).toBeNull();

    await first.commit();
    expect(demo.getActiveConversationId()).toBeNull();

    await second.commit();
    await second.commit();
    expect(demo.getActiveConversationId()).toBe("demo-conv-gift-wrap");
  });

  it("prepareStartNew creates the conversation only on commit", async () => {
    const demo = provider();
    const discarded = await demo.prepareStartNew({ context: browser });
    discarded.discard();
    await discarded.commit();
    expect(demo.getConversationIds()).toHaveLength(5);
    expect(demo.getActiveConversationId()).toBeNull();

    const prepared = await demo.prepareStartNew({ context: browser });
    await prepared.commit();
    expect(demo.getConversationIds()).toHaveLength(6);
    expect(demo.getActiveConversationId()).toBe(prepared.conversationId);
    // Empty conversations are never listed, matching the API.
    const listed = await demo.list({ context: browser });
    expect(listed.items.map((item) => item.id)).not.toContain(prepared.conversationId);
  });
});

describe("revisions", () => {
  it("advances on every mutation and refreshes the summary", async () => {
    const demo = provider();
    const before = demo.getConversationRevision("demo-conv-order-status");
    demo.appendMessage("demo-conv-order-status", {
      role: "assistant",
      content: "One more thing about your delivery window.",
    });
    const after = demo.getConversationRevision("demo-conv-order-status");
    expect(after).not.toBe(before);

    demo.appendMessage("demo-conv-order-status", {
      role: "user",
      content: "Understood, thanks.",
    });
    expect(demo.getConversationRevision("demo-conv-order-status")).not.toBe(after);

    const page = await demo.getPage("demo-conv-order-status", { context: browser });
    expect(page.summary.messageCount).toBe(6);
    expect(page.summary.preview).toBe("Understood, thanks.");
    expect(page.conversationRevision).toBe(
      demo.getConversationRevision("demo-conv-order-status")
    );
  });

  it("mints distinct revisions per conversation", () => {
    const demo = provider();
    const revisions = demo
      .getConversationIds()
      .map((id) => demo.getConversationRevision(id));
    expect(new Set(revisions).size).toBe(revisions.length);
  });
});

describe("identity status injection", () => {
  it("defaults to browser_only / no_identity_provider", () => {
    expect(provider().getIdentityStatus()).toEqual({
      state: "browser_only",
      reason: "no_identity_provider",
    });
  });

  it("notifies subscribers on change and dedupes identical states", () => {
    const demo = provider();
    const seen: unknown[] = [];
    const unsubscribe = demo.subscribeIdentityStatus((status) => seen.push(status));

    demo.setIdentityStatus({ state: "verifying" });
    demo.setIdentityStatus({ state: "verifying" });
    demo.setIdentityStatus({ state: "verified" });
    demo.setIdentityStatus({
      state: "authentication_required",
      reason: "invalid_identity_proof",
    });
    demo.setIdentityStatus({
      state: "authentication_required",
      reason: "proof_unavailable_after_binding",
    });

    expect(seen).toEqual([
      { state: "verifying" },
      { state: "verified" },
      { state: "authentication_required", reason: "invalid_identity_proof" },
      { state: "authentication_required", reason: "proof_unavailable_after_binding" },
    ]);
    expect(demo.getIdentityStatus()).toEqual({
      state: "authentication_required",
      reason: "proof_unavailable_after_binding",
    });

    unsubscribe();
    demo.setIdentityStatus({ state: "identity_provider_failed" });
    expect(seen).toHaveLength(4);
    expect(demo.getIdentityStatus()).toEqual({ state: "identity_provider_failed" });
  });

  it("accepts an injected initial status", () => {
    const demo = provider({ identityStatus: { state: "verified" } });
    expect(demo.getIdentityStatus()).toEqual({ state: "verified" });
  });
});

describe("failure injection", () => {
  it("failNext fails exactly once per queued entry", async () => {
    const demo = provider();
    demo.failNext("list", { code: "rate_limited", retryAfterSeconds: 30 });
    const error = await demo.list({ context: browser }).catch((err: unknown) => err);
    expect((error as HistoryProviderError).code).toBe("rate_limited");
    expect((error as HistoryProviderError).retryAfterSeconds).toBe(30);

    const recovered = await demo.list({ context: browser });
    expect(recovered.items).toHaveLength(5);
  });

  it("persistent failures apply until cleared, per operation", async () => {
    const demo = provider({ failures: { getPage: { code: "unavailable" } } });
    await expect(
      demo.getPage("demo-conv-order-status", { context: browser })
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      demo.getPage("demo-conv-order-status", { context: browser })
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(demo.list({ context: browser })).resolves.toBeTruthy();

    demo.setFailure("deleteAll", { code: "authentication_required" });
    await expect(demo.deleteAll({ context: browser })).rejects.toMatchObject({
      code: "authentication_required",
    });

    demo.clearFailures();
    await expect(
      demo.getPage("demo-conv-order-status", { context: browser })
    ).resolves.toBeTruthy();
    await expect(demo.deleteAll({ context: browser })).resolves.toEqual({ deleted: 5 });
  });

  it("a failed mutation leaves the store untouched", async () => {
    const demo = provider();
    demo.failNext("delete", { code: "authentication_failed" });
    await expect(
      demo.delete("demo-conv-order-status", { context: browser })
    ).rejects.toMatchObject({ code: "authentication_failed" });
    expect(demo.getConversationIds()).toHaveLength(5);
  });
});

describe("latency injection", () => {
  it("delays operations by the configured latency", async () => {
    vi.useFakeTimers();
    const demo = provider({ latencyMs: 250 });
    let settled = false;
    const pending = demo.list({ context: browser }).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(settled).toBe(true);

    demo.setLatency(0);
    settled = false;
    await demo.list({ context: browser }).then(() => {
      settled = true;
    });
    expect(settled).toBe(true);
  });
});
