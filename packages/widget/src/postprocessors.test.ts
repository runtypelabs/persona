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

describe("markdown renderer overrides receive the documented token", () => {
  it("hands link() a token with href, title, and text", () => {
    const seen: unknown[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        link(token) {
          seen.push(token);
          return `<a data-custom href="${token.href}">${token.text}</a>`;
        },
      },
    });
    const html = md('[Docs](https://example.com "Handbook")');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: "link",
      href: "https://example.com",
      title: "Handbook",
      text: "Docs",
    });
    expect(html).toContain('<a data-custom href="https://example.com">Docs</a>');
  });

  it("hands code() a token with text and lang", () => {
    const seen: unknown[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        code(token) {
          seen.push(token);
          return `<pre data-lang="${token.lang}">${token.text}</pre>`;
        },
      },
    });
    const html = md("```ts\nconst x = 1;\n```");

    expect(seen[0]).toMatchObject({ type: "code", lang: "ts", text: "const x = 1;" });
    expect(html).toContain('<pre data-lang="ts">const x = 1;</pre>');
  });

  it("hands heading() a token with depth, text, and raw", () => {
    const seen: unknown[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        heading(token) {
          seen.push(token);
          return `<h${token.depth} data-custom>${token.text}</h${token.depth}>`;
        },
      },
    });
    const html = md("### Section title");

    expect(seen[0]).toMatchObject({
      type: "heading",
      depth: 3,
      text: "Section title",
    });
    expect((seen[0] as { raw: string }).raw).toContain("Section title");
    expect(html).toContain("<h3 data-custom>Section title</h3>");
  });

  it("hands image() a null title when the source declares none", () => {
    const seen: unknown[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        image(token) {
          seen.push(token);
          return `<img data-custom src="${token.href}" alt="${token.text}">`;
        },
      },
    });
    md("![Chart](https://example.com/c.png)");

    expect(seen[0]).toMatchObject({
      type: "image",
      href: "https://example.com/c.png",
      title: null,
      text: "Chart",
    });
  });

  it("carries the parser's rendered children for table and list", () => {
    const md = createMarkdownProcessor({
      renderer: {
        table(token) {
          return `<table data-custom>${token.headerHtml}${token.bodyHtml}</table>`;
        },
        list(token) {
          return `<ul data-custom data-ordered="${token.ordered}">${token.itemsHtml}</ul>`;
        },
      },
    });

    expect(md("- one\n- two")).toContain('<ul data-custom data-ordered="false">');
    expect(md("- one\n- two")).toContain("one");
    const table = md("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(table).toContain("<table data-custom>");
    expect(table).toContain("<th>a</th>");
  });

  it("still falls through to the default renderer when an override returns false", () => {
    const md = createMarkdownProcessor({
      renderer: {
        heading: () => false,
      },
    });
    expect(md("# Title")).toContain("Title");
    expect(md("# Title")).toContain("<h1");
  });

  it("hands overrides rendered inline HTML as text, not markdown tokens", () => {
    const seen: string[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        paragraph(token) {
          seen.push(token.text);
          return false;
        },
      },
    });
    md("a **b** `c`");

    expect(seen).toEqual(["a <strong>b</strong> <code>c</code>"]);
  });

  it("escapes source text before an override can interpolate it", () => {
    const seen: Record<string, string | null> = {};
    const md = createMarkdownProcessor({
      renderer: {
        link(token) {
          seen.title = token.title;
          return false;
        },
        image(token) {
          seen.alt = token.text;
          seen.imageTitle = token.title;
          return false;
        },
        codespan(token) {
          seen.code = token.text;
          return false;
        },
        text(token) {
          seen.text = token.text;
          return false;
        },
      },
    });
    md('[x](https://a.com "<b>") ![<i>](https://a.com/i.png "\'t") `<s>`');
    md("1 < 2 & 3");

    expect(seen).toMatchObject({
      title: "&lt;b&gt;",
      alt: "&lt;i&gt;",
      imageTitle: "&#39;t",
      code: "&lt;s&gt;",
      text: "1 &lt; 2 &amp; 3",
    });
  });

  it("does not double-escape an entity in a title", () => {
    let title: string | null = null;
    const md = createMarkdownProcessor({
      renderer: {
        link(token) {
          title = token.title;
          return false;
        },
      },
    });
    md('[x](https://a.com "a &amp; b")');

    expect(title).toBe("a &amp; b");
  });

  it("escapes an angle-bracket autolink href and leaves a bare URL's alone", () => {
    const hrefs: string[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        link(token) {
          hrefs.push(token.href);
          return false;
        },
      },
    });
    md("<https://a.com/?x=1&y=2>");
    md("https://b.com/?x=1&y=2");

    expect(hrefs).toEqual(["https://a.com/?x=1&amp;y=2", "https://b.com/?x=1&y=2"]);
  });

  it("gives heading() the plain text as raw, for slugs", () => {
    let raw = "";
    const md = createMarkdownProcessor({
      renderer: {
        heading(token) {
          raw = token.raw;
          return false;
        },
      },
    });
    md("## Some *emphasis* and `code`");

    expect(raw).toBe("Some emphasis and code");
  });

  it("renders children once when an override falls through", () => {
    const calls: string[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        blockquote: () => false,
        list: () => false,
        listitem: () => false,
        paragraph: () => false,
        strong: () => false,
        table: () => false,
        link: () => false,
        heading: () => false,
        text(token) {
          calls.push(token.text);
          return false;
        },
      },
    });
    const html = md(
      "# h\n\n> > **deep**\n\n- [l](https://a.com)\n  - nested\n\n| c |\n| - |\n| d |"
    );

    expect(calls).toEqual(["h", "deep", "l", "nested", "c", "d"]);
    expect(html).toContain('<a href="https://a.com">l</a>');
    expect(html).toContain("<table>\n<thead>\n<tr>\n<th>c</th>\n</tr>\n</thead>\n<tbody><tr>");
    expect(html).toContain("<ul>\n<li>");
  });

  it("keeps deep fall-through nesting linear", () => {
    let calls = 0;
    const md = createMarkdownProcessor({
      renderer: {
        blockquote: () => false,
        text() {
          calls += 1;
          return false;
        },
      },
    });
    md(`${">".repeat(24)} deep`);

    expect(calls).toBe(1);
  });

  it("keeps rendered children out of the html override on fall-through", () => {
    const seen: string[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        paragraph: () => false,
        html(token) {
          seen.push(token.text);
          return false;
        },
      },
    });
    expect(md("a <b>x</b>")).toContain("<p>a <b>x</b></p>");
    expect(seen).toEqual(["<b>", "</b>"]);
  });

  it("keeps the ordered list start on fall-through", () => {
    const md = createMarkdownProcessor({ renderer: { list: () => false } });

    expect(md("3. a")).toContain('<ol start="3">');
    expect(md("1. a")).toContain("<ol>");
  });

  it("separates a custom task checkbox from its label", () => {
    const md = createMarkdownProcessor({
      renderer: { checkbox: ({ checked }) => `<i data-checked="${checked}"></i>` },
    });

    expect(md("- [x] done")).toContain('<i data-checked="true"></i> done');
  });

  it("lets a block text token's inline children reach the text override once", () => {
    const seen: string[] = [];
    const md = createMarkdownProcessor({
      renderer: {
        text(token) {
          seen.push(token.text);
          return `[${token.text}]`;
        },
      },
    });

    expect(md("- item")).toContain("[item]");
    expect(seen).toEqual(["item"]);
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
