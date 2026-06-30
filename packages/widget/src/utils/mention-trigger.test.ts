import { describe, it, expect } from "vitest";
import {
  parseMentionTrigger,
  isMenuOpeningInput,
  stripMentionQuery,
} from "./mention-trigger";

describe("parseMentionTrigger", () => {
  it("activates on @ at the start of input", () => {
    const m = parseMentionTrigger("@App", 4);
    expect(m).toEqual({ triggerIndex: 0, query: "App" });
  });

  it("activates on @ after whitespace mid-sentence", () => {
    const m = parseMentionTrigger("check @fo", 9);
    expect(m).toEqual({ triggerIndex: 6, query: "fo" });
  });

  it("returns an empty query right after a bare @", () => {
    const m = parseMentionTrigger("hi @", 4);
    expect(m).toEqual({ triggerIndex: 3, query: "" });
  });

  it("does NOT activate for an email (@ glued to a word char)", () => {
    expect(parseMentionTrigger("user@example.com", 16)).toBeNull();
    expect(parseMentionTrigger("user@", 5)).toBeNull();
  });

  it("closes once a space follows the trigger", () => {
    // caret after "fo bar" — whitespace between query and caret ends the mention
    expect(parseMentionTrigger("@fo bar", 7)).toBeNull();
  });

  it("tracks the nearest active trigger when caret is mid-query", () => {
    const m = parseMentionTrigger("a @one @two", 11);
    expect(m).toEqual({ triggerIndex: 7, query: "two" });
  });

  it("returns null at caret 0 or out of range", () => {
    expect(parseMentionTrigger("@x", 0)).toBeNull();
    expect(parseMentionTrigger("@x", 99)).toBeNull();
  });

  it("honors a custom trigger character", () => {
    expect(parseMentionTrigger("see #iss", 8, "#")).toEqual({
      triggerIndex: 4,
      query: "iss",
    });
    expect(parseMentionTrigger("see #iss", 8, "@")).toBeNull();
  });

  it("handles multi-byte characters in the query", () => {
    const m = parseMentionTrigger("@café", 5);
    expect(m).toEqual({ triggerIndex: 0, query: "café" });
  });
});

describe("isMenuOpeningInput", () => {
  it("opens on typed text and unknown input types", () => {
    expect(isMenuOpeningInput("insertText")).toBe(true);
    expect(isMenuOpeningInput(undefined)).toBe(true);
  });

  it("does not open on paste or drop", () => {
    expect(isMenuOpeningInput("insertFromPaste")).toBe(false);
    expect(isMenuOpeningInput("insertFromDrop")).toBe(false);
  });
});

describe("stripMentionQuery", () => {
  it("removes the @query span and moves the caret to the trigger", () => {
    const value = "check @App for bugs";
    const match = parseMentionTrigger("check @App", 10)!;
    // caret sits right after "@App" (index 10)
    const out = stripMentionQuery(value, match, 10);
    expect(out.value).toBe("check  for bugs");
    expect(out.caret).toBe(6);
  });

  it("strips a bare trigger with empty query", () => {
    const out = stripMentionQuery("hi @", { triggerIndex: 3, query: "" }, 4);
    expect(out.value).toBe("hi ");
    expect(out.caret).toBe(3);
  });
});
