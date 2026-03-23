// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createDefaultSanitizer, resolveSanitizer } from "./sanitize";

describe("createDefaultSanitizer", () => {
  const sanitize = createDefaultSanitizer();

  it("strips <script> tags", () => {
    expect(sanitize("<p>Hello</p><script>alert(1)</script>")).toBe("<p>Hello</p>");
  });

  it("strips onerror event handlers from img tags", () => {
    const result = sanitize('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).toContain("<img");
  });

  it("strips javascript: URIs from links", () => {
    const result = sanitize('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("strips onclick handlers", () => {
    const result = sanitize('<div onclick="alert(1)">click</div>');
    expect(result).not.toContain("onclick");
  });

  it("allows safe markdown output: headings", () => {
    expect(sanitize("<h1>Title</h1>")).toBe("<h1>Title</h1>");
    expect(sanitize("<h2>Subtitle</h2>")).toBe("<h2>Subtitle</h2>");
  });

  it("allows safe markdown output: paragraphs and formatting", () => {
    expect(sanitize("<p><strong>bold</strong> and <em>italic</em></p>"))
      .toBe("<p><strong>bold</strong> and <em>italic</em></p>");
  });

  it("allows safe markdown output: lists", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    expect(sanitize(html)).toBe(html);
  });

  it("allows safe markdown output: code blocks", () => {
    const html = '<pre><code class="language-js">const x = 1;</code></pre>';
    expect(sanitize(html)).toBe(html);
  });

  it("allows safe markdown output: tables", () => {
    const html = "<table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table>";
    expect(sanitize(html)).toBe(html);
  });

  it("allows safe links with href", () => {
    const html = '<a href="https://example.com" target="_blank">link</a>';
    expect(sanitize(html)).toBe(html);
  });

  it("allows safe images with https src", () => {
    const html = '<img src="https://example.com/img.png" alt="pic">';
    expect(sanitize(html)).toBe(html);
  });

  it("allows data:image/ URIs (non-SVG)", () => {
    const html = '<img src="data:image/png;base64,abc123" alt="pic">';
    expect(sanitize(html)).toBe(html);
  });

  it("blocks data:image/svg+xml URIs", () => {
    const result = sanitize('<img src="data:image/svg+xml,<svg onload=alert(1)>">');
    expect(result).not.toContain("data:image/svg+xml");
  });

  it("blocks mixed-case data: URI scheme bypass", () => {
    const result = sanitize('<img src="Data:image/svg+xml,<svg onload=alert(1)>">');
    expect(result).not.toContain("Data:image/svg+xml");
    const result2 = sanitize('<img src="DATA:image/svg+xml,<svg onload=alert(1)>">');
    expect(result2).not.toContain("DATA:image/svg+xml");
  });

  it("preserves widget-specific data attributes", () => {
    const html = '<div class="persona-form-directive" data-tv-form="init"></div>';
    expect(sanitize(html)).toBe(html);
  });

  it("preserves data-persona-component-directive", () => {
    const html = '<div data-persona-component-directive="card"></div>';
    expect(sanitize(html)).toBe(html);
  });
});

describe("resolveSanitizer", () => {
  it("returns default sanitizer for undefined", () => {
    const fn = resolveSanitizer(undefined);
    expect(fn).toBeTypeOf("function");
    expect(fn!("<script>bad</script>")).toBe("");
  });

  it("returns default sanitizer for true", () => {
    const fn = resolveSanitizer(true);
    expect(fn).toBeTypeOf("function");
    expect(fn!("<script>bad</script>")).toBe("");
  });

  it("returns null for false (disabled)", () => {
    expect(resolveSanitizer(false)).toBeNull();
  });

  it("returns the custom function as-is", () => {
    const custom = (html: string) => html.toUpperCase();
    const fn = resolveSanitizer(custom);
    expect(fn).toBe(custom);
    expect(fn!("hello")).toBe("HELLO");
  });
});
