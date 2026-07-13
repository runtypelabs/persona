// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  highlightCode,
  resolveHighlightLanguage,
  MAX_HIGHLIGHT_LENGTH,
} from "./code-highlight";

/** Reconstruct the source from a highlighted fragment (invariant helper). */
const textOf = (frag: DocumentFragment): string => {
  const holder = document.createElement("div");
  holder.appendChild(frag.cloneNode(true));
  return holder.textContent ?? "";
};

/** Collect token classes present in a highlighted fragment. */
const tokenClasses = (frag: DocumentFragment): string[] => {
  const holder = document.createElement("div");
  holder.appendChild(frag.cloneNode(true));
  return Array.from(holder.querySelectorAll("span[class^='persona-code-token-']"))
    .map((el) => el.className);
};

const classFor = (source: string, lang: string, snippet: string): string | null => {
  const holder = document.createElement("div");
  holder.appendChild(highlightCode(source, lang));
  const spans = Array.from(
    holder.querySelectorAll("span[class^='persona-code-token-']")
  );
  const hit = spans.find((el) => el.textContent === snippet);
  return hit ? hit.className : null;
};

describe("resolveHighlightLanguage", () => {
  it("prefers explicit language and maps aliases", () => {
    expect(resolveHighlightLanguage("html")).toBe("html");
    expect(resolveHighlightLanguage("htm")).toBe("html");
    expect(resolveHighlightLanguage("mjs")).toBe("js");
    expect(resolveHighlightLanguage("tsx")).toBe("js");
    expect(resolveHighlightLanguage("typescript")).toBe("js");
    expect(resolveHighlightLanguage("jsonc")).toBe("json");
  });

  it("falls back to the file extension", () => {
    expect(resolveHighlightLanguage(undefined, "src/app.css")).toBe("css");
    expect(resolveHighlightLanguage(undefined, "a/b/main.ts")).toBe("js");
    expect(resolveHighlightLanguage(undefined, "index.html")).toBe("html");
  });

  it("returns null for unknown languages and extensionless paths", () => {
    expect(resolveHighlightLanguage("rust")).toBeNull();
    expect(resolveHighlightLanguage(undefined, "Makefile")).toBeNull();
    expect(resolveHighlightLanguage(undefined)).toBeNull();
  });
});

describe("highlightCode token classification", () => {
  it("classifies js keywords, strings, numbers, and comments", () => {
    expect(classFor("const x = 1;", "js", "const")).toBe(
      "persona-code-token-keyword"
    );
    expect(classFor('const s = "hi";', "js", '"hi"')).toBe(
      "persona-code-token-string"
    );
    expect(classFor("const n = 42;", "js", "42")).toBe(
      "persona-code-token-number"
    );
    expect(classFor("// note\nx", "js", "// note")).toBe(
      "persona-code-token-comment"
    );
    expect(classFor("const b = true;", "js", "true")).toBe(
      "persona-code-token-keyword"
    );
  });

  it("classifies json keys as property and values as string", () => {
    const src = '{"name": "cat", "n": 3, "ok": true}';
    expect(classFor(src, "json", '"name"')).toBe("persona-code-token-property");
    expect(classFor(src, "json", '"cat"')).toBe("persona-code-token-string");
    expect(classFor(src, "json", "3")).toBe("persona-code-token-number");
    expect(classFor(src, "json", "true")).toBe("persona-code-token-keyword");
  });

  it("classifies css properties, values, at-rules, and comments", () => {
    const src = "@media all { .a { color: #fff; margin: 4px; } } /* c */";
    expect(classFor(src, "css", "color")).toBe("persona-code-token-property");
    expect(classFor(src, "css", "#fff")).toBe("persona-code-token-number");
    expect(classFor(src, "css", "@media")).toBe("persona-code-token-keyword");
    expect(classFor(src, "css", "/* c */")).toBe("persona-code-token-comment");
  });

  it("classifies html tags, attributes, attribute values, and comments", () => {
    const src = '<a href="x">hi</a><!-- c -->';
    expect(classFor(src, "html", "href")).toBe("persona-code-token-attr");
    expect(classFor(src, "html", '"x"')).toBe("persona-code-token-string");
    expect(classFor(src, "html", "<!-- c -->")).toBe(
      "persona-code-token-comment"
    );
    // Tag bracket + name.
    expect(classFor(src, "html", "<a")).toBe("persona-code-token-tag");
  });

  it("highlights embedded <script> bodies with the js tokenizer", () => {
    const src = "<script>const y = 2;</script>";
    expect(classFor(src, "html", "const")).toBe("persona-code-token-keyword");
  });
});

describe("highlightCode line + newline invariants", () => {
  it("splits a multi-line block comment across lines without newlines in spans", () => {
    const src = "/* line one\nline two */\nvar x;";
    const frag = highlightCode(src, "js");
    const holder = document.createElement("div");
    holder.appendChild(frag.cloneNode(true));
    const commentSpans = holder.querySelectorAll(".persona-code-token-comment");
    // The block comment spans two lines → two comment spans, neither with "\n".
    expect(commentSpans.length).toBe(2);
    commentSpans.forEach((el) => expect(el.textContent).not.toContain("\n"));
    // No token span anywhere contains a newline.
    holder
      .querySelectorAll("span[class^='persona-code-token-']")
      .forEach((el) => expect(el.textContent).not.toContain("\n"));
  });

  it("reconstructs the source verbatim (textContent === source)", () => {
    for (const [src, lang] of [
      ["const x = 1;\nconst y = 2;\n", "js"],
      ["line1\nline2\nline3", "js"],
      ["a\n\nb\n", "js"],
      ['{"k": "v"}\n', "json"],
      ["<div>\n  <span>hi</span>\n</div>\n", "html"],
      ["", "js"],
    ] as const) {
      expect(textOf(highlightCode(src, lang))).toBe(src);
    }
  });

  it("does not emit a phantom numbered line for a trailing newline", () => {
    const holder = document.createElement("div");
    holder.appendChild(highlightCode("a\nb\n", "js"));
    // "a\nb\n" → 2 numbered lines, trailing newline preserved in textContent.
    expect(holder.querySelectorAll(".persona-code-line").length).toBe(2);
    expect(holder.textContent).toBe("a\nb\n");
  });

  it("keeps one line for wholly empty source", () => {
    const holder = document.createElement("div");
    holder.appendChild(highlightCode("", "js"));
    expect(holder.querySelectorAll(".persona-code-line").length).toBe(1);
    expect(holder.textContent).toBe("");
  });
});

describe("highlightCode fallbacks and safety", () => {
  it("returns plain line-numbered text for an unknown language", () => {
    const frag = highlightCode("const x = 1;", "rust");
    expect(tokenClasses(frag)).toEqual([]);
  });

  it("skips tokenization for oversized sources", () => {
    const big = "const x = 1;\n".repeat(
      Math.ceil((MAX_HIGHLIGHT_LENGTH + 100) / 13)
    );
    expect(big.length).toBeGreaterThan(MAX_HIGHLIGHT_LENGTH);
    const frag = highlightCode(big, "js");
    expect(tokenClasses(frag)).toEqual([]);
    // Still line-numbered (line spans present) and verbatim.
    const holder = document.createElement("div");
    holder.appendChild(frag);
    expect(holder.querySelector(".persona-code-line")).toBeTruthy();
  });

  it("never emits any element other than spans for hostile input", () => {
    // XSS-shaped content embedded as a JS string literal.
    const src = 'const html = "<img src=x onerror=alert(1)>";';
    const holder = document.createElement("div");
    holder.appendChild(highlightCode(src, "js"));
    // Only <span> elements exist; no <img> (or anything else) was created.
    const all = Array.from(holder.querySelectorAll("*"));
    expect(all.every((el) => el.tagName === "SPAN")).toBe(true);
    expect(holder.querySelector("img")).toBeNull();
    // The dangerous text survives as inert text content.
    expect(holder.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
