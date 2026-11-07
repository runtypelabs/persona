import type { Renderer, RendererObject, Token, Tokens } from "marked";
import type { AgentWidgetMarkdownRendererOverrides } from "../types";

/** `&` that does not already start an entity, plus the other HTML specials. */
const UNESCAPED_HTML = /[<>"']|&(?!(?:#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeUnescapedHtml = (text: string): string =>
  text.replace(UNESCAPED_HTML, (char) => HTML_ENTITIES[char]);
const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);

/** Tokens that carry children already rendered for an override. */
const renderedChildren = new WeakSet<object>();

/**
 * Finish an override call. On a `false` return, swap the token's children for
 * their rendered HTML so the default renderer does not render them, and fire
 * nested overrides, a second time at every nesting level.
 */
const settle = (result: string | false, token: { tokens?: Token[] }, html: string): string | false => {
  if (result === false) {
    const children: Tokens.HTML = { type: "html", raw: html, text: html, block: false, pre: false };
    renderedChildren.add(children);
    token.tokens = [children];
  }
  return result;
};

/**
 * Adapt `AgentWidgetMarkdownRendererOverrides` to the renderer contract of the
 * bundled marked. marked passes its raw tokens, so each wrapper builds the
 * documented token instead: `text` is rendered HTML (a string an override can
 * interpolate), and values marked leaves unescaped until its default renderers
 * run arrive escaped. `raw` and `tokens` arrive `""` / `[]`. A `false` return
 * still falls through to the default renderer.
 */
export const convertRendererOverrides = (
  overrides?: AgentWidgetMarkdownRendererOverrides
): Partial<RendererObject> | undefined => {
  if (!overrides) return undefined;

  const out: Record<string, unknown> = {};
  const o = overrides;

  if (o.heading) {
    const fn = o.heading;
    out.heading = function (this: Renderer, token: Tokens.Heading) {
      const text = this.parser.parseInline(token.tokens);
      return settle(
        fn({
          type: "heading",
          raw: this.parser.parseInline(token.tokens, this.parser.textRenderer),
          depth: token.depth as 1 | 2 | 3 | 4 | 5 | 6,
          text,
          tokens: [],
        }),
        token,
        text
      );
    };
  }
  if (o.code) {
    const fn = o.code;
    out.code = ({ text, lang, escaped }: Tokens.Code) =>
      fn({ type: "code", raw: "", text, lang, escaped: !!escaped });
  }
  if (o.blockquote) {
    const fn = o.blockquote;
    out.blockquote = function (this: Renderer, token: Tokens.Blockquote) {
      const text = this.parser.parse(token.tokens);
      return settle(fn({ type: "blockquote", raw: "", text, tokens: [] }), token, text);
    };
  }
  if (o.table) {
    const fn = o.table;
    out.table = function (this: Renderer, token: Tokens.Table) {
      const row = (cells: Tokens.TableCell[]) =>
        this.tablerow({ text: cells.map((cell) => this.tablecell(cell)).join("") });
      const headerHtml = row(token.header);
      const bodyHtml = token.rows.map(row).join("");
      const html = fn({ type: "table", raw: "", header: [], rows: [], align: [], headerHtml, bodyHtml });
      if (html !== false) return html;
      const body = bodyHtml && `<tbody>${bodyHtml}</tbody>`;
      return `<table>\n<thead>\n${headerHtml}</thead>\n${body}</table>\n`;
    };
  }
  if (o.link) {
    const fn = o.link;
    out.link = function (this: Renderer, token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      return settle(
        fn({
          type: "link",
          raw: "",
          href: token.autolink && token.raw.startsWith("<") ? escapeUnescapedHtml(token.href) : token.href,
          title: token.title ? escapeUnescapedHtml(token.title) : null,
          text,
          tokens: [],
        }),
        token,
        text
      );
    };
  }
  if (o.image) {
    const fn = o.image;
    out.image = function (this: Renderer, { href, title, text, tokens }: Tokens.Image) {
      return fn({
        type: "image",
        raw: "",
        href,
        title: title ? escapeUnescapedHtml(title) : null,
        text: escapeUnescapedHtml(
          tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text
        ),
      });
    };
  }
  if (o.list) {
    const fn = o.list;
    out.list = function (this: Renderer, { items, ordered, start }: Tokens.List) {
      const itemsHtml = items.map((item) => this.listitem(item)).join("");
      const html = fn({ type: "list", raw: "", ordered, start, loose: false, items: [], itemsHtml });
      if (html !== false) return html;
      const tag = ordered ? "ol" : "ul";
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
      return `<${tag}${startAttr}>\n${itemsHtml}</${tag}>\n`;
    };
  }
  if (o.listitem) {
    const fn = o.listitem;
    out.listitem = function (this: Renderer, token: Tokens.ListItem) {
      const text = this.parser.parse(token.tokens);
      return settle(
        fn({
          type: "list_item",
          raw: "",
          task: token.task,
          checked: !!token.checked,
          loose: false,
          text,
          tokens: [],
        }),
        token,
        text
      );
    };
  }
  if (o.paragraph) {
    const fn = o.paragraph;
    out.paragraph = function (this: Renderer, token: Tokens.Paragraph) {
      const text = this.parser.parseInline(token.tokens);
      return settle(fn({ type: "paragraph", raw: "", text, tokens: [] }), token, text);
    };
  }
  if (o.codespan) {
    const fn = o.codespan;
    out.codespan = ({ text }: Tokens.Codespan) =>
      fn({ type: "codespan", raw: "", text: escapeHtml(text) });
  }
  if (o.strong) {
    const fn = o.strong;
    out.strong = function (this: Renderer, token: Tokens.Strong) {
      const text = this.parser.parseInline(token.tokens);
      return settle(fn({ type: "strong", raw: "", text, tokens: [] }), token, text);
    };
  }
  if (o.em) {
    const fn = o.em;
    out.em = function (this: Renderer, token: Tokens.Em) {
      const text = this.parser.parseInline(token.tokens);
      return settle(fn({ type: "em", raw: "", text, tokens: [] }), token, text);
    };
  }
  if (o.del) {
    const fn = o.del;
    out.del = function (this: Renderer, token: Tokens.Del) {
      const text = this.parser.parseInline(token.tokens);
      return settle(fn({ type: "del", raw: "", text, tokens: [] }), token, text);
    };
  }
  if (o.html) {
    const fn = o.html;
    out.html = (token: Tokens.HTML | Tokens.Tag) =>
      renderedChildren.has(token) ? token.text : fn({ type: "html", raw: token.text, text: token.text });
  }
  if (o.text) {
    const fn = o.text;
    out.text = (token: Tokens.Text | Tokens.Escape) => {
      // A block text token only wraps inline tokens, which reach this override.
      if ("tokens" in token && token.tokens) return false;
      const text = "escaped" in token && token.escaped ? token.text : escapeUnescapedHtml(token.text);
      return fn({ type: "text", raw: text, text });
    };
  }
  if (o.checkbox) {
    const fn = o.checkbox;
    out.checkbox = ({ checked }: Tokens.Checkbox) => {
      const html = fn({ checked });
      return html === false ? false : `${html} `;
    };
  }
  // No arguments to adapt.
  if (o.hr) out.hr = () => o.hr?.();
  if (o.br) out.br = () => o.br?.();

  return out as unknown as Partial<RendererObject>;
};
