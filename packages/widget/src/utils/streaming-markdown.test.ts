import { describe, expect, it } from "vitest";
import { stabilizeStreamingMarkdown as stabilize } from "./streaming-markdown";
import { createMarkdownProcessor } from "../postprocessors";

const markdown = createMarkdownProcessor();

describe("streaming Markdown display", () => {
  it.each(["**bold**", "*italic*", "_italic_", "__bold__", "***both***", "**bold *italic***", "*italic **bold***", "`a*b`", "``a`b``"])("renders every nonempty content prefix of %s without raw delimiters", (source) => {
    for (let length = 1; length <= source.length; length++) {
      const html = markdown(stabilize(`Start ${source.slice(0, length)}`));
      const text = html.replace(/<[^>]*>/g, "");
      if (!source.includes("`")) expect(text).not.toMatch(/[*_]/);
    }
    expect(markdown(stabilize(source))).toBe(markdown(source));
  });

  it("stabilizes every character boundary across multiple completed and new spans", () => {
    const source = "Watch **bold**, *italic*, and `inline code`. Try **nested *emphasis*** and _more_ with __bold__ afterward.";
    for (let length = 1; length <= source.length; length++) {
      const html = markdown(stabilize(source.slice(0, length)));
      expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/[*_`]/);
    }
    expect(markdown(stabilize(source))).toBe(markdown(source));
  });

  it.each([
    "* list item", "_ literal _", "foo_bar_baz", "2 * 3", "2*3", "foo*bar", "<https://example.com/a_b>", '<span data-label="**hello">text</span>', "***", "*", "\\*literal", "\\`literal", "\\[literal", "[ordinary] prose",
    "[x](https://example.com/it's)", "[x](https://example.com/a_(b))", '[x](https://example.com "a title")', "![x](image.png)",
    "```md\n**literal\n| a | b |\n| -\n```", "> ```\n*literal\n> ```", "- ```\n**literal\n  ```", "    **literal"
  ])("preserves completed or ambiguous input %j", (source) => {
    expect(stabilize(source)).toBe(source);
  });

  it("shows incomplete link labels as text and only activates complete destinations", () => {
    const source = "[read more](https://example.com/a_(b))";
    for (let length = 1; length < source.length; length++) {
      const html = markdown(stabilize(source.slice(0, length)));
      expect(html).not.toContain("<a ");
      expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/[[\]()]/);
    }
    expect(markdown(stabilize(source))).toContain('<a href="https://example.com/a_(b)">read more</a>');
  });

  it("holds incomplete images, including escaped brackets and nested URL parentheses", () => {
    const source = "![an \\] image](https://example.com/a_(b).png)";
    for (let length = 2; length < source.length; length++) {
      expect(stabilize(`Before ${source.slice(0, length)}`)).toBe("Before ");
    }
    expect(stabilize(source)).toBe(source);
    expect(stabilize("Before ![image](url\\")).toBe("Before ");
    expect(stabilize("Before [link](url\\")).toBe("Before link");
  });

  it("stabilizes formatting inside unfinished link labels", () => {
    expect(markdown(stabilize("[**hello"))).toContain("<strong>hello</strong>");
    expect(markdown(stabilize("[**hello**](https://example"))).toContain("<strong>hello</strong>");
  });

  it("keeps inline code contents and escapes inert", () => {
    expect(markdown(stabilize("Here `**[x](url)"))).toContain("<code>**[x](url)</code>");
    expect(stabilize("\\\\**bold")).toBe("\\\\**bold**");
    expect(markdown(stabilize("**hello\\"))).toContain("<strong>hello\\</strong>");
  });

  it("preserves whitespace outside a temporarily completed emphasis span", () => {
    expect(stabilize("**hello ")).toBe("**hello** ");
    expect(stabilize("**hello\n\nNext")).toBe("**hello**\n\nNext");
  });

  it("continues table completion outside code fences", () => {
    expect(markdown(stabilize("| A | B |\n| -"))).toContain("<table>");
  });
});
