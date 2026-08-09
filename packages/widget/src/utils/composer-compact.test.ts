import { describe, expect, it } from "vitest";

import {
  createComposerCompactLatch,
  isComposerCompact,
  type ComposerCompactInput,
} from "./composer-compact";

const base: ComposerCompactInput = {
  text: "",
  wrapped: false,
  hasAttachments: false,
  hasChips: false,
  hasQuote: false,
  hasPendingSubmission: false,
  dictationActive: false,
};

describe("isComposerCompact", () => {
  it("an empty composer is compact", () => {
    expect(isComposerCompact(base)).toBe(true);
  });

  it("a single line of text stays compact", () => {
    expect(isComposerCompact({ ...base, text: "hello" })).toBe(true);
  });

  it("an explicit newline expands", () => {
    expect(isComposerCompact({ ...base, text: "a\nb" })).toBe(false);
  });

  it("a measured wrap expands", () => {
    expect(isComposerCompact({ ...base, text: "long", wrapped: true })).toBe(false);
  });

  it.each([
    ["hasAttachments"],
    ["hasChips"],
    ["hasQuote"],
    ["hasPendingSubmission"],
    ["dictationActive"],
  ] as const)("%s expands an otherwise empty composer", (key) => {
    expect(isComposerCompact({ ...base, [key]: true })).toBe(false);
  });

  it("one hasChips input covers a mode chip, a mention chip, and both", () => {
    // The shared row is one rail: the predicate can no longer disagree with
    // itself about which chip kind is present.
    expect(isComposerCompact({ ...base, hasChips: true, text: "hi" })).toBe(false);
  });
});

describe("createComposerCompactLatch", () => {
  it("stays expanded after a wrap until the draft is cleared", () => {
    const latch = createComposerCompactLatch();
    expect(latch.observe(false, "short")).toBe(false);
    expect(latch.observe(true, "a very long line that wrapped")).toBe(true);
    // The measurement dropped back but the draft is still there.
    expect(latch.observe(false, "short again")).toBe(true);
    expect(latch.observe(false, "")).toBe(false);
  });

  it("release() lets the next single-line draft collapse again", () => {
    const latch = createComposerCompactLatch();
    latch.observe(true, "wrapped");
    latch.release();
    expect(latch.observe(false, "short")).toBe(false);
  });
});
