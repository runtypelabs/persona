import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildStoredDraft,
  createDraftWriter,
  rehydrateStoredDraft,
} from "./composer-draft";

describe("buildStoredDraft", () => {
  it("returns undefined when there is nothing worth storing", () => {
    expect(buildStoredDraft({ text: "" })).toBeUndefined();
    expect(buildStoredDraft({ text: "   " })).toBeUndefined();
  });

  it("stores text plus the optional selection state", () => {
    expect(
      buildStoredDraft({
        text: "hi",
        selectedModelId: "m1",
        activeModeIds: ["search"],
        quote: { text: "q" },
      })
    ).toEqual({
      text: "hi",
      selectedModelId: "m1",
      activeModeIds: ["search"],
      quote: { text: "q" },
    });
  });

  it("stores a quote-only draft with empty text", () => {
    expect(buildStoredDraft({ text: "", quote: { text: "q" } })).toEqual({
      text: "",
      quote: { text: "q" },
    });
  });
});

describe("rehydrateStoredDraft", () => {
  const config = {
    mentionSourceIds: ["files"],
    modelIds: ["m1"],
    modes: [{ id: "search", label: "Search" }],
  };

  it("returns undefined for a missing draft", () => {
    expect(rehydrateStoredDraft(undefined, config)).toBeUndefined();
  });

  it("always restores the text", () => {
    expect(rehydrateStoredDraft({ text: "hi" }, config)?.text).toBe("hi");
  });

  it("keeps mention tokens whose source still exists", () => {
    const restored = rehydrateStoredDraft(
      {
        text: "hi @a",
        mentionRefs: [{ sourceId: "files", itemId: "a", label: "a" }],
        contentSegments: [{ kind: "text", text: "hi " }],
      },
      config
    );
    expect(restored?.mentionRefs).toHaveLength(1);
    expect(restored?.contentSegments).toHaveLength(1);
  });

  it("degrades to plain text and omits segments when the source is gone", () => {
    const restored = rehydrateStoredDraft(
      {
        text: "hi @a",
        mentionRefs: [{ sourceId: "removed", itemId: "a", label: "a" }],
        contentSegments: [{ kind: "text", text: "hi " }],
      },
      config
    );
    expect(restored?.text).toBe("hi @a");
    expect(restored?.mentionRefs).toBeUndefined();
    expect(restored?.contentSegments).toBeUndefined();
  });

  it("drops a model id that is no longer configured", () => {
    expect(
      rehydrateStoredDraft({ text: "hi", selectedModelId: "gone" }, config)
        ?.selectedModelId
    ).toBeUndefined();
    expect(
      rehydrateStoredDraft({ text: "hi", selectedModelId: "m1" }, config)
        ?.selectedModelId
    ).toBe("m1");
  });

  it("filters modes down to the still-configured ids", () => {
    expect(
      rehydrateStoredDraft({ text: "hi", activeModeIds: ["search", "gone"] }, config)
        ?.activeModeIds
    ).toEqual(["search"]);
  });

  it("restores the quote", () => {
    expect(
      rehydrateStoredDraft({ text: "", quote: { text: "q" } }, config)?.quote
    ).toEqual({ text: "q" });
  });
});

describe("createDraftWriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces repeated schedules into one write", () => {
    const write = vi.fn();
    const writer = createDraftWriter({ write, delay: 500 });
    writer.schedule();
    writer.schedule();
    writer.schedule();
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush writes immediately and only when one is queued", () => {
    const write = vi.fn();
    const writer = createDraftWriter({ write });
    writer.flush();
    expect(write).not.toHaveBeenCalled();
    writer.schedule();
    writer.flush();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the queued write", () => {
    const write = vi.fn();
    const writer = createDraftWriter({ write });
    writer.schedule();
    writer.cancel();
    vi.advanceTimersByTime(1000);
    expect(write).not.toHaveBeenCalled();
  });

  it("destroy stops any further writes", () => {
    const write = vi.fn();
    const writer = createDraftWriter({ write });
    writer.schedule();
    writer.destroy();
    writer.schedule();
    vi.advanceTimersByTime(1000);
    expect(write).not.toHaveBeenCalled();
  });
});
