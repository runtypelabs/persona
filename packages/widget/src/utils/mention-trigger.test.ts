import { describe, it, expect } from "vitest";
import {
  parseMentionTrigger,
  parseAnyTrigger,
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

  describe("position gating (for / slash-commands)", () => {
    it("line-start: activates at input start and after a newline", () => {
      expect(parseMentionTrigger("/dep", 4, "/", "line-start")).toEqual({
        triggerIndex: 0,
        query: "dep",
      });
      expect(parseMentionTrigger("hi\n/dep", 7, "/", "line-start")).toEqual({
        triggerIndex: 3,
        query: "dep",
      });
    });

    it("line-start: does NOT activate mid-line (after a space)", () => {
      expect(parseMentionTrigger("hi /dep", 7, "/", "line-start")).toBeNull();
    });

    it("input-start: only at index 0", () => {
      expect(parseMentionTrigger("/x", 2, "/", "input-start")).toEqual({
        triggerIndex: 0,
        query: "x",
      });
      expect(parseMentionTrigger("hi\n/x", 5, "/", "input-start")).toBeNull();
    });
  });
});

describe("parseAnyTrigger", () => {
  const channels = [
    { trigger: "@", position: "anywhere" as const },
    { trigger: "/", position: "line-start" as const },
  ];

  it("picks the @ channel for a mid-sentence mention", () => {
    const hit = parseAnyTrigger("hey @fo", 7, channels);
    expect(hit?.channelIndex).toBe(0);
    expect(hit?.match).toEqual({ triggerIndex: 4, query: "fo" });
  });

  it("picks the / channel only at line-start", () => {
    const hit = parseAnyTrigger("/dep", 4, channels);
    expect(hit?.channelIndex).toBe(1);
    expect(hit?.match).toEqual({ triggerIndex: 0, query: "dep" });
  });

  it("does not match / mid-line even though @ is anywhere", () => {
    expect(parseAnyTrigger("hi /dep", 7, channels)).toBeNull();
  });

  it("returns null when no channel is active", () => {
    expect(parseAnyTrigger("plain text", 10, channels)).toBeNull();
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
