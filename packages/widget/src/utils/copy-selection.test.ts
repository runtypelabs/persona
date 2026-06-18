import { describe, it, expect } from "vitest";
import { normalizeCopiedSelectionText } from "./copy-selection";

describe("normalizeCopiedSelectionText", () => {
  it("strips a single trailing newline left by block-element serialization", () => {
    const raw = "Create a markdown document titled \"Bridge Test Report\".\n";
    expect(normalizeCopiedSelectionText(raw)).toBe(
      "Create a markdown document titled \"Bridge Test Report\"."
    );
  });

  it("strips multiple trailing blank lines and whitespace", () => {
    expect(normalizeCopiedSelectionText("hello\n\n  \n")).toBe("hello");
  });

  it("strips leading blank lines", () => {
    expect(normalizeCopiedSelectionText("\n\nhello")).toBe("hello");
  });

  it("preserves interior newlines (multi-paragraph / multi-message selection)", () => {
    expect(normalizeCopiedSelectionText("first\n\nsecond\n")).toBe("first\n\nsecond");
  });

  it("preserves leading indentation on the first line (copied code)", () => {
    expect(normalizeCopiedSelectionText("    indented line\nnext\n")).toBe(
      "    indented line\nnext"
    );
  });

  it("returns an unchanged string when there is nothing to trim", () => {
    expect(normalizeCopiedSelectionText("clean text")).toBe("clean text");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeCopiedSelectionText("\n\n  \n")).toBe("");
  });
});
