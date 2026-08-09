import { describe, expect, it } from "vitest";

import {
  applyQuoteToContent,
  formatQuoteBlock,
  summarizeQuoteText,
} from "./composer-quote";

describe("formatQuoteBlock", () => {
  it("wraps the quote in a labelled fence", () => {
    expect(formatQuoteBlock({ text: "hello" })).toBe(
      "```quoted-text\nhello\n```"
    );
  });

  it("carries the source label in the info string", () => {
    expect(formatQuoteBlock({ text: "hello", sourceLabel: "Docs" })).toBe(
      "```quoted-text source=Docs\nhello\n```"
    );
  });

  it("escalates the fence past backticks inside the quoted text", () => {
    const block = formatQuoteBlock({ text: "```js\ncode\n```" });
    expect(block.startsWith("````quoted-text\n")).toBe(true);
    expect(block.endsWith("\n````")).toBe(true);
  });

  it("returns an empty string for a blank or missing quote", () => {
    expect(formatQuoteBlock(undefined)).toBe("");
    expect(formatQuoteBlock({ text: "   " })).toBe("");
  });
});

describe("applyQuoteToContent", () => {
  it("returns nothing without a quote, so non-quoted sends are unchanged", () => {
    expect(applyQuoteToContent({ text: "hi" })).toEqual({});
    expect(
      applyQuoteToContent({ text: "hi", contentParts: [{ type: "text", text: "hi" }] })
    ).toEqual({});
  });

  it("prefixes llmContent for a plain string message", () => {
    const result = applyQuoteToContent({ quote: { text: "q" }, text: "hi" });
    expect(result.contentParts).toBeUndefined();
    expect(result.llmContent).toBe("```quoted-text\nq\n```\n\nhi");
  });

  it("prepends a text part for a contentParts message", () => {
    const parts = [
      { type: "image" as const, image: "data:image/png;base64,x", mimeType: "image/png" },
      { type: "text" as const, text: "hi" },
    ];
    const result = applyQuoteToContent({
      quote: { text: "q" },
      text: "hi",
      contentParts: parts,
    });
    expect(result.llmContent).toBeUndefined();
    expect(result.contentParts).toHaveLength(3);
    expect(result.contentParts?.[0]).toEqual({
      type: "text",
      text: "```quoted-text\nq\n```",
    });
    expect(result.contentParts?.slice(1)).toEqual(parts);
  });
});

describe("summarizeQuoteText", () => {
  it("collapses whitespace", () => {
    expect(summarizeQuoteText("a\n\n  b ")).toBe("a b");
  });

  it("clamps long text with an ellipsis", () => {
    expect(summarizeQuoteText("abcdef", 4)).toBe("abc…");
  });
});
