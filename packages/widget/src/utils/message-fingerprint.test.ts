import { describe, it, expect, vi } from "vitest";
import {
  computeMessageFingerprint,
  createMessageCache,
  getCachedWrapper,
  setCachedWrapper,
  pruneCache,
  type FingerprintableMessage,
} from "./message-fingerprint";

function makeMessage(overrides: Partial<FingerprintableMessage> = {}): FingerprintableMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "Hello world",
    streaming: false,
    ...overrides,
  };
}

function createFakeWrapper(id: string): HTMLElement {
  return {
    id: `wrapper-${id}`,
    cloneNode: vi.fn(function (this: HTMLElement) {
      return { ...this };
    }),
  } as unknown as HTMLElement;
}

describe("computeMessageFingerprint", () => {
  it("produces a stable fingerprint for the same message", () => {
    const msg = makeMessage();
    const fp1 = computeMessageFingerprint(msg, 0);
    const fp2 = computeMessageFingerprint(msg, 0);
    expect(fp1).toBe(fp2);
  });

  it("changes when content changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ content: "Hello" }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ content: "Hello world" }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when streaming changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ streaming: false }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ streaming: true }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when role changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ role: "assistant" }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ role: "user" }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when variant changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ variant: undefined }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ variant: "reasoning" }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when configVersion changes", () => {
    const msg = makeMessage();
    const fp1 = computeMessageFingerprint(msg, 0);
    const fp2 = computeMessageFingerprint(msg, 1);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when rawContent changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ rawContent: undefined }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ rawContent: '{"action":"checkout"}' }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when llmContent changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ llmContent: undefined }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ llmContent: "context for llm" }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when approval status changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ approval: { status: "pending" } }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ approval: { status: "approved" } }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when toolCall status changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ toolCall: { status: "running" } }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ toolCall: { status: "complete" } }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when reasoning chunks change", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ reasoning: { chunks: ["step 1"] } }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ reasoning: { chunks: ["step 1", "step 2"] } }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("changes when contentParts length changes", () => {
    const fp1 = computeMessageFingerprint(makeMessage({ contentParts: [] }), 0);
    const fp2 = computeMessageFingerprint(makeMessage({ contentParts: [{ type: "text", text: "hi" }] }), 0);
    expect(fp1).not.toBe(fp2);
  });

  it("handles undefined optional fields", () => {
    const msg: FingerprintableMessage = { id: "x", role: "user", content: "" };
    const fp = computeMessageFingerprint(msg, 0);
    expect(typeof fp).toBe("string");
    expect(fp.length).toBeGreaterThan(0);
  });

  it("detects streaming content appends via last-32-chars check", () => {
    const fp1 = computeMessageFingerprint(
      makeMessage({ content: "The quick brown fox jumps over the lazy dog" }),
      0
    );
    const fp2 = computeMessageFingerprint(
      makeMessage({ content: "The quick brown fox jumps over the lazy dog!" }),
      0
    );
    expect(fp1).not.toBe(fp2);
  });
});

describe("MessageCache", () => {
  it("returns null for unknown message id", () => {
    const cache = createMessageCache();
    expect(getCachedWrapper(cache, "unknown", "fp")).toBeNull();
  });

  it("returns cached wrapper on fingerprint match", () => {
    const cache = createMessageCache();
    const wrapper = createFakeWrapper("msg-1");
    setCachedWrapper(cache, "msg-1", "fp-abc", wrapper);

    const result = getCachedWrapper(cache, "msg-1", "fp-abc");
    expect(result).toBe(wrapper);
  });

  it("returns null on fingerprint mismatch", () => {
    const cache = createMessageCache();
    const wrapper = createFakeWrapper("msg-1");
    setCachedWrapper(cache, "msg-1", "fp-abc", wrapper);

    const result = getCachedWrapper(cache, "msg-1", "fp-different");
    expect(result).toBeNull();
  });

  it("overwrites entry on re-set", () => {
    const cache = createMessageCache();
    const wrapper1 = createFakeWrapper("msg-1");
    const wrapper2 = createFakeWrapper("msg-1");
    setCachedWrapper(cache, "msg-1", "fp-1", wrapper1);
    setCachedWrapper(cache, "msg-1", "fp-2", wrapper2);

    expect(getCachedWrapper(cache, "msg-1", "fp-1")).toBeNull();
    expect(getCachedWrapper(cache, "msg-1", "fp-2")).toBe(wrapper2);
  });

  it("prunes entries for removed message IDs", () => {
    const cache = createMessageCache();
    setCachedWrapper(cache, "a", "fp-a", createFakeWrapper("a"));
    setCachedWrapper(cache, "b", "fp-b", createFakeWrapper("b"));
    setCachedWrapper(cache, "c", "fp-c", createFakeWrapper("c"));

    const active = new Set(["a", "b"]);
    pruneCache(cache, active);

    expect(getCachedWrapper(cache, "a", "fp-a")).not.toBeNull();
    expect(getCachedWrapper(cache, "b", "fp-b")).not.toBeNull();
    expect(getCachedWrapper(cache, "c", "fp-c")).toBeNull();
  });

  it("handles pruning with empty active set", () => {
    const cache = createMessageCache();
    setCachedWrapper(cache, "a", "fp-a", createFakeWrapper("a"));

    pruneCache(cache, new Set());
    expect(getCachedWrapper(cache, "a", "fp-a")).toBeNull();
  });

  it("handles pruning an empty cache", () => {
    const cache = createMessageCache();
    pruneCache(cache, new Set(["a"]));
    expect(cache.size).toBe(0);
  });
});
