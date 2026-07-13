/**
 * Tiny hand-rolled syntax highlighter for the artifact source view.
 *
 * Zero dependencies by design: the IIFE bundle is built with `--splitting
 * false`, so any highlight.js / prism / shiki style library would be inlined
 * and inflate the critical bundle. This module is a small regex tokenizer
 * (html / css / js|ts / json) plus a DOM builder that emits one
 * `span.persona-code-line` per source line for the CSS-counter gutter.
 *
 * Safety by construction: the DOM is built ONLY with `createElement` +
 * `textContent` + `createTextNode` — never `innerHTML` — so the output is safe
 * regardless of the widget's `sanitize` config, even when the source itself is
 * hostile markup (e.g. `<img src=x onerror=…>`).
 *
 * Verbatim-reconstruction invariant: the built fragment's `textContent` equals
 * the original `source` exactly. Every source newline becomes a literal `"\n"`
 * text node placed *between* line spans; token spans never contain a newline
 * (multi-line tokens such as block comments and template literals are split at
 * newline boundaries into per-line spans of the same class). A trailing source
 * newline is preserved as a `"\n"` text node without a phantom numbered empty
 * final line.
 */
import { createElement, createFragment } from "./dom";

/** Token classification. `plain`/`punctuation` render as bare text (no span). */
export type CodeTokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "tag"
  | "attr"
  | "property"
  | "punctuation"
  | "plain";

export interface CodeToken {
  type: CodeTokenType;
  value: string;
}

/** Canonical tokenizer keys. `ts`/`jsx`/`tsx` share the `js` tokenizer. */
export type HighlightLanguage = "html" | "css" | "js" | "json";

/** Token type → CSS class. Types absent here render as a bare text node. */
const TOKEN_CLASS: Partial<Record<CodeTokenType, string>> = {
  keyword: "persona-code-token-keyword",
  string: "persona-code-token-string",
  comment: "persona-code-token-comment",
  number: "persona-code-token-number",
  tag: "persona-code-token-tag",
  attr: "persona-code-token-attr",
  property: "persona-code-token-property",
};

/**
 * Streaming perf guard: skip tokenization above this many characters and fall
 * back to plain line-numbered text. `renderPre` runs on every streaming delta,
 * so keep the tokenizer off huge sources.
 */
export const MAX_HIGHLIGHT_LENGTH = 150_000;

/** Extension / short-name → canonical tokenizer key. */
const LANGUAGE_ALIASES: Record<string, HighlightLanguage> = {
  html: "html",
  htm: "html",
  xhtml: "html",
  xml: "html",
  svg: "html",
  css: "css",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  ts: "js",
  tsx: "js",
  mts: "js",
  cts: "js",
  javascript: "js",
  typescript: "js",
  ecmascript: "js",
  json: "json",
  jsonc: "json",
  json5: "json",
};

/**
 * Resolve a canonical tokenizer from an explicit language or a file path
 * extension. Returns `null` for anything unmapped (plain-text fallback).
 */
export function resolveHighlightLanguage(
  language?: string,
  path?: string
): HighlightLanguage | null {
  const lang = (language || "").trim().toLowerCase();
  if (lang && LANGUAGE_ALIASES[lang]) return LANGUAGE_ALIASES[lang];

  if (path) {
    const dot = path.lastIndexOf(".");
    if (dot >= 0) {
      const ext = path.slice(dot + 1).toLowerCase();
      if (LANGUAGE_ALIASES[ext]) return LANGUAGE_ALIASES[ext];
    }
  }
  return null;
}

interface Rule {
  type: CodeTokenType;
  /** Sticky (`y`) regex so a match only counts when it starts at `lastIndex`. */
  re: RegExp;
  /** Optional reclassifier (e.g. identifier → keyword when in a keyword set). */
  map?: (text: string) => CodeTokenType;
}

/**
 * Left-to-right rule scanner. At each index the first rule that matches at that
 * exact position wins; unmatched characters accrete into a single `plain` run.
 */
function runRules(source: string, rules: Rule[]): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;
  let plainStart = 0;
  const flushPlain = (end: number) => {
    if (end > plainStart) {
      tokens.push({ type: "plain", value: source.slice(plainStart, end) });
    }
  };

  while (i < source.length) {
    let matched = false;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(source);
      if (m && m.index === i && m[0].length > 0) {
        flushPlain(i);
        const type = rule.map ? rule.map(m[0]) : rule.type;
        tokens.push({ type, value: m[0] });
        i += m[0].length;
        plainStart = i;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }
  flushPlain(source.length);
  return tokens;
}

const JS_KEYWORDS = new Set([
  "abstract", "any", "as", "async", "await", "boolean", "break", "case",
  "catch", "class", "const", "continue", "debugger", "declare", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "from", "function", "get", "if", "implements", "import", "in",
  "instanceof", "interface", "keyof", "let", "namespace", "never", "new",
  "null", "number", "object", "of", "private", "protected", "public",
  "readonly", "return", "satisfies", "set", "static", "string", "super",
  "switch", "symbol", "this", "throw", "true", "try", "type", "typeof",
  "undefined", "unknown", "var", "void", "while", "yield",
]);

const JS_RULES: Rule[] = [
  { type: "comment", re: /\/\/[^\n]*/y },
  { type: "comment", re: /\/\*[\s\S]*?\*\//y },
  { type: "string", re: /`(?:\\[\s\S]|[^\\`])*`/y },
  { type: "string", re: /"(?:\\.|[^"\\\n])*"/y },
  { type: "string", re: /'(?:\\.|[^'\\\n])*'/y },
  {
    type: "number",
    re: /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y,
  },
  {
    type: "plain",
    re: /[A-Za-z_$][\w$]*/y,
    map: (t) => (JS_KEYWORDS.has(t) ? "keyword" : "plain"),
  },
];

function tokenizeJs(source: string): CodeToken[] {
  return runRules(source, JS_RULES);
}

const JSON_RULES: Rule[] = [
  { type: "string", re: /"(?:\\.|[^"\\])*"/y },
  { type: "number", re: /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y },
  {
    type: "plain",
    re: /[A-Za-z_]\w*/y,
    map: (t) =>
      t === "true" || t === "false" || t === "null" ? "keyword" : "plain",
  },
];

function tokenizeJson(source: string): CodeToken[] {
  const tokens = runRules(source, JSON_RULES);
  // Reclassify object keys: a string whose next significant token opens with
  // `:` is a property, not a value string.
  for (let idx = 0; idx < tokens.length; idx += 1) {
    if (tokens[idx].type !== "string") continue;
    let j = idx + 1;
    while (j < tokens.length && tokens[j].value.trim() === "") j += 1;
    const next = tokens[j];
    if (next && next.value.replace(/^\s*/, "").startsWith(":")) {
      tokens[idx].type = "property";
    }
  }
  return tokens;
}

const CSS_RULES: Rule[] = [
  { type: "comment", re: /\/\*[\s\S]*?\*\//y },
  { type: "string", re: /"(?:\\.|[^"\\\n])*"/y },
  { type: "string", re: /'(?:\\.|[^'\\\n])*'/y },
  { type: "keyword", re: /@[A-Za-z-]+/y },
  { type: "number", re: /#[0-9a-fA-F]{3,8}\b/y },
  { type: "number", re: /-?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?/y },
  { type: "plain", re: /[A-Za-z_-][\w-]*/y },
];

function tokenizeCss(source: string): CodeToken[] {
  const tokens = runRules(source, CSS_RULES);
  // Property detection: an identifier immediately followed by `:` counts as a
  // declaration property only when the previous significant character opens a
  // declaration (`{`, `}`, `;`, `,`, or start of input). This keeps selectors
  // and pseudo-classes (`a:hover`) plain in the common cases.
  let lastSignificant = "";
  for (let idx = 0; idx < tokens.length; idx += 1) {
    const tok = tokens[idx];
    if (tok.type === "plain" && /^[A-Za-z_-][\w-]*$/.test(tok.value)) {
      let j = idx + 1;
      while (j < tokens.length && tokens[j].value.trim() === "") j += 1;
      const next = tokens[j];
      if (
        next &&
        next.value.replace(/^\s*/, "").startsWith(":") &&
        (lastSignificant === "" ||
          lastSignificant === "{" ||
          lastSignificant === "}" ||
          lastSignificant === ";" ||
          lastSignificant === ",")
      ) {
        tok.type = "property";
      }
    }
    const trimmed = tok.value.replace(/\s+$/, "");
    if (trimmed) lastSignificant = trimmed[trimmed.length - 1];
  }
  return tokens;
}

const HTML_TAG_RULES: Rule[] = [
  { type: "tag", re: /<\/?\s*[A-Za-z][\w:-]*/y },
  { type: "string", re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y },
  { type: "attr", re: /[A-Za-z_:@][\w:.-]*(?=\s*=)/y },
  { type: "attr", re: /[A-Za-z_:@][\w:.-]*/y },
  { type: "tag", re: /\/?>/y },
];

function tokenizeHtml(source: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const push = (type: CodeTokenType, value: string) => {
    if (value) tokens.push({ type, value });
  };
  const n = source.length;
  let i = 0;

  while (i < n) {
    // Comments.
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      const stop = end === -1 ? n : end + 3;
      push("comment", source.slice(i, stop));
      i = stop;
      continue;
    }
    // Doctype (and other `<!…>` declarations).
    if (source[i] === "<" && source[i + 1] === "!") {
      const end = source.indexOf(">", i);
      const stop = end === -1 ? n : end + 1;
      push("tag", source.slice(i, stop));
      i = stop;
      continue;
    }
    // Element tag.
    if (source[i] === "<" && /[A-Za-z/]/.test(source[i + 1] || "")) {
      const tagEnd = source.indexOf(">", i);
      const stop = tagEnd === -1 ? n : tagEnd + 1;
      const tagText = source.slice(i, stop);
      for (const t of runRules(tagText, HTML_TAG_RULES)) tokens.push(t);
      i = stop;

      // Embedded <script>/<style> bodies: tokenize with the js/css tokenizer.
      const embed = /^<\s*(script|style)\b/i.exec(tagText);
      if (embed && !/\/>\s*$/.test(tagText)) {
        const tag = embed[1].toLowerCase();
        const closeRe = new RegExp("</\\s*" + tag + "\\s*>", "i");
        const cm = closeRe.exec(source.slice(i));
        const innerEnd = cm ? i + cm.index : n;
        const inner = source.slice(i, innerEnd);
        const innerTokens =
          tag === "script" ? tokenizeJs(inner) : tokenizeCss(inner);
        for (const t of innerTokens) tokens.push(t);
        i = innerEnd;
      }
      continue;
    }
    // Text content up to the next `<` (or a lone `<` that is not a tag).
    const lt = source.indexOf("<", i);
    if (lt === i) {
      push("plain", source[i]);
      i += 1;
    } else {
      const stop = lt === -1 ? n : lt;
      push("plain", source.slice(i, stop));
      i = stop;
    }
  }
  return tokens;
}

function tokenizeByLanguage(
  source: string,
  lang: HighlightLanguage
): CodeToken[] {
  switch (lang) {
    case "html":
      return tokenizeHtml(source);
    case "css":
      return tokenizeCss(source);
    case "js":
      return tokenizeJs(source);
    case "json":
      return tokenizeJson(source);
  }
}

/** Build one `span.persona-code-line` per source line from a token stream. */
function buildLines(tokens: CodeToken[]): DocumentFragment {
  const frag = createFragment();
  let line = createElement("span", "persona-code-line");

  const appendSegment = (type: CodeTokenType, text: string) => {
    if (!text) return;
    const cls = TOKEN_CLASS[type];
    if (cls) {
      const span = createElement("span", cls);
      span.textContent = text;
      line.appendChild(span);
    } else {
      line.appendChild(document.createTextNode(text));
    }
  };

  for (const tok of tokens) {
    const parts = tok.value.split("\n");
    for (let p = 0; p < parts.length; p += 1) {
      if (p > 0) {
        // Close the current line, then emit the literal newline separator that
        // keeps `textContent` verbatim. `.persona-code` sets white-space:normal
        // so this whitespace-only node collapses visually between block lines.
        frag.appendChild(line);
        frag.appendChild(document.createTextNode("\n"));
        line = createElement("span", "persona-code-line");
      }
      appendSegment(tok.type, parts[p]);
    }
  }

  if (line.childNodes.length > 0) {
    frag.appendChild(line);
  } else if (!frag.lastChild) {
    // Wholly empty source: keep the single empty line so the gutter shows "1".
    frag.appendChild(line);
  }
  // Otherwise the source ended with a newline: the trailing "\n" separator is
  // already in the fragment, so drop the empty phantom final line + number.
  return frag;
}

/**
 * Tokenize `source` and return a DocumentFragment of line spans (+ newline
 * separator text nodes). Prefers the explicit `language`, then the `path`
 * extension, else plain text. Sources longer than {@link MAX_HIGHLIGHT_LENGTH}
 * are returned as plain line-numbered text (still gutter-numbered, no colors).
 */
export function highlightCode(
  source: string,
  language?: string,
  path?: string
): DocumentFragment {
  const lang =
    source.length <= MAX_HIGHLIGHT_LENGTH
      ? resolveHighlightLanguage(language, path)
      : null;
  const tokens: CodeToken[] = lang
    ? tokenizeByLanguage(source, lang)
    : [{ type: "plain", value: source }];
  return buildLines(tokens);
}
