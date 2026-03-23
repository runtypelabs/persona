// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  createMarkdownProcessor,
  createDirectivePostprocessor,
  escapeHtml,
} from "./postprocessors";
import { createDefaultSanitizer } from "./utils/sanitize";

describe("markdown + sanitization integration", () => {
  const md = createMarkdownProcessor();
  const sanitize = createDefaultSanitizer();

  it("strips script tags from markdown output", () => {
    const html = sanitize(md("# Title\n<script>alert(1)</script>"));
    expect(html).toContain("<h1>Title</h1>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it("strips onerror handlers from img tags in markdown", () => {
    const html = sanitize(md('<img src="x" onerror="alert(1)">'));
    expect(html).not.toContain("onerror");
  });

  it("strips javascript: URIs from markdown links", () => {
    const html = sanitize(md('[click](javascript:alert(1))'));
    expect(html).not.toContain("javascript:");
  });

  it("preserves safe markdown headings", () => {
    const html = sanitize(md("## Hello\n\nParagraph text."));
    expect(html).toContain("<h2>Hello</h2>");
    expect(html).toContain("<p>Paragraph text.</p>");
  });

  it("preserves safe markdown code blocks", () => {
    const html = sanitize(md("```js\nconst x = 1;\n```"));
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("preserves safe links", () => {
    const html = sanitize(md("[example](https://example.com)"));
    expect(html).toContain('href="https://example.com"');
  });
});

describe("directive postprocessor + sanitization", () => {
  const directive = createDirectivePostprocessor();
  const sanitize = createDefaultSanitizer();

  it("preserves form directive placeholders", () => {
    const html = sanitize(directive('<Form type="init" />'));
    expect(html).toContain('data-tv-form="init"');
    expect(html).toContain("persona-form-directive");
  });

  it("sanitizes content surrounding directives", () => {
    const html = sanitize(directive('<Form type="init" />\n<script>bad</script>'));
    expect(html).toContain('data-tv-form="init"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("bad");
  });

  it("handles JSON-style directives", () => {
    const html = sanitize(
      directive('<Directive>{"component":"form","type":"contact"}</Directive>')
    );
    expect(html).toContain('data-tv-form="contact"');
  });
});

describe("escapeHtml", () => {
  it("escapes all HTML special characters", () => {
    expect(escapeHtml('<script>alert("xss")&</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&amp;&lt;/script&gt;"
    );
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
});
