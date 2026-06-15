import { describe, it, expect } from "vitest";
import { stripMarkdownForSpeech, resolveSpeakableText, extractActionMessageText } from "./speech-text";

describe("stripMarkdownForSpeech", () => {
  it("returns empty string for empty/undefined input", () => {
    expect(stripMarkdownForSpeech("")).toBe("");
    // @ts-expect-error testing defensive undefined handling
    expect(stripMarkdownForSpeech(undefined)).toBe("");
  });

  it("strips bold and italic markers but keeps the words", () => {
    expect(stripMarkdownForSpeech("This is **bold** and *italic* text")).toBe(
      "This is bold and italic text"
    );
    expect(stripMarkdownForSpeech("__strong__ and _em_")).toBe("strong and em");
  });

  it("keeps inline code text without backticks", () => {
    expect(stripMarkdownForSpeech("Run `npm install` first")).toBe("Run npm install first");
  });

  it("drops fenced code blocks entirely", () => {
    const md = "Here is code:\n```js\nconst x = 1;\n```\nDone.";
    const out = stripMarkdownForSpeech(md);
    expect(out).not.toContain("const x");
    expect(out).toContain("Here is code:");
    expect(out).toContain("Done.");
  });

  it("speaks link text, not the URL", () => {
    expect(stripMarkdownForSpeech("See [the docs](https://example.com/x) now")).toBe(
      "See the docs now"
    );
  });

  it("speaks image alt text", () => {
    expect(stripMarkdownForSpeech("![a red car](car.png)")).toBe("a red car");
  });

  it("strips heading, blockquote, and list markers", () => {
    expect(stripMarkdownForSpeech("# Title")).toBe("Title");
    expect(stripMarkdownForSpeech("> quoted")).toBe("quoted");
    expect(stripMarkdownForSpeech("- item one\n- item two")).toBe("item one\nitem two");
    expect(stripMarkdownForSpeech("1. first\n2. second")).toBe("first\nsecond");
  });

  it("strips raw HTML tags", () => {
    expect(stripMarkdownForSpeech("Hello <strong>world</strong>!")).toBe("Hello world !");
  });

  it("decodes common HTML entities", () => {
    expect(stripMarkdownForSpeech("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });

  it("collapses excess whitespace and trims", () => {
    expect(stripMarkdownForSpeech("  lots   of\n\n\nspace  ")).toBe("lots of\nspace");
  });

  it("handles a realistic mixed message", () => {
    const md = [
      "## Summary",
      "",
      "I'd **ship** `approval.choices.alwaysAllow` and [this one](https://x.y).",
      "",
      "```ts",
      "const skip = true;",
      "```",
      "",
      "- point A",
      "- point B",
    ].join("\n");
    const out = stripMarkdownForSpeech(md);
    expect(out).toContain("Summary");
    expect(out).toContain("I'd ship approval.choices.alwaysAllow and this one.");
    expect(out).toContain("point A");
    expect(out).not.toContain("```");
    expect(out).not.toContain("const skip");
    expect(out).not.toContain("https://x.y");
  });
});

describe("extractActionMessageText", () => {
  it("extracts text from a bare action envelope", () => {
    expect(extractActionMessageText('{"action":"message","text":"Hello there"}')).toBe("Hello there");
  });

  it("extracts text from a fenced ```json envelope", () => {
    const raw = '```json\n{\n  "action": "message",\n  "text": "Why don\'t scientists trust atoms?"\n}\n```';
    expect(extractActionMessageText(raw)).toBe("Why don't scientists trust atoms?");
  });

  it("returns null for plain prose", () => {
    expect(extractActionMessageText("Just a normal reply")).toBeNull();
  });

  it("returns null for JSON without a string text field", () => {
    expect(extractActionMessageText('{"action":"navigate","url":"/x"}')).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(extractActionMessageText('{"action":"message", "text":')).toBeNull();
  });
});

describe("resolveSpeakableText", () => {
  it("speaks the action text, not the JSON envelope", () => {
    const raw = '```json\n{"action":"message","text":"Why don\'t scientists trust atoms?"}\n```';
    expect(resolveSpeakableText(raw)).toBe("Why don't scientists trust atoms?");
  });

  it("strips markdown from action text", () => {
    expect(resolveSpeakableText('{"action":"message","text":"Ship **it** now"}')).toBe("Ship it now");
  });

  it("falls back to markdown stripping for plain prose", () => {
    expect(resolveSpeakableText("This is **bold**")).toBe("This is bold");
  });

  it("returns empty string for empty input", () => {
    expect(resolveSpeakableText("")).toBe("");
  });
});
