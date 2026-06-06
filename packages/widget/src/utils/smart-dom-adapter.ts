/**
 * Pure mapper: `@mcp-b/smart-dom-reader` output → Persona's {@link EnrichedPageElement}[].
 *
 * This module imports the smart-dom-reader types with `import type` ONLY, so the
 * library's runtime value is never pulled in here. That keeps the mapper — and its
 * unit test — free of any DOM and free of the (vendored) library at runtime; the
 * types are erased during compilation.
 *
 * The smart-dom-reader returns a structured {@link SmartDOMResult} JSON object with
 * rich selectors (CSS + XPath + ranked candidates). Persona's collect → reason → act
 * loop drives clicks through `document.querySelector` (see `utils/actions.ts`), which
 * cannot pierce shadow roots or evaluate XPath. So this mapper deliberately prefers
 * the **best plain-CSS candidate selector** for each element and skips XPath / text
 * pseudo-selectors, keeping results actionable.
 */

import type {
  SmartDOMResult,
  ExtractedElement,
  ElementSelectorCandidate
} from "../vendor/smart-dom-reader";
import type { EnrichedPageElement } from "./dom-context";

/** Options for {@link smartDomResultToEnriched}. */
export interface SmartDomAdapterOptions {
  /**
   * Include non-interactive `semantic` groups (headings, images, tables, lists,
   * articles) when the result has them (i.e. full-mode extraction). Default: true.
   */
  includeSemantic?: boolean;
  /**
   * Skip elements whose own selector / ancestor chain contains this selector string,
   * so the widget never reports its own shadow-DOM UI. Matched as a substring against
   * the element's candidate selectors and `context.parentChain`. Default: ".persona-host".
   * Pass "" to disable.
   */
  excludeSelector?: string;
  /** Truncate each element's text to this many characters. Default: 200. */
  maxTextLength?: number;
  /** Optional cap on the number of mapped elements returned. */
  maxElements?: number;
}

/**
 * Candidate selector types that resolve through `document.querySelector` (plain CSS).
 * Everything else smart-dom-reader can emit — `xpath` and text pseudo-selectors —
 * is not actionable via the current click loop, so it is skipped here.
 */
const PLAIN_CSS_CANDIDATE_TYPES: ReadonlySet<ElementSelectorCandidate["type"]> =
  new Set(["id", "data-testid", "role-aria", "name", "class-path", "css-path"]);

/** Looks like an XPath expression rather than a CSS selector. */
function looksLikeXPath(value: string): boolean {
  const v = value.trim();
  return v.startsWith("/") || v.startsWith("(") || v.startsWith("./");
}

/**
 * Pick the best `document.querySelector`-able selector for an extracted element:
 * the highest-scoring plain-CSS candidate, falling back to the primary `css` field
 * when no candidate qualifies. Returns null when only XPath-like selectors exist.
 */
function bestPlainCssSelector(el: ExtractedElement): string | null {
  const candidates = el.selector.candidates;
  if (candidates && candidates.length > 0) {
    let best: ElementSelectorCandidate | null = null;
    for (const c of candidates) {
      if (!PLAIN_CSS_CANDIDATE_TYPES.has(c.type)) continue;
      if (!c.value || looksLikeXPath(c.value)) continue;
      if (!best || c.score > best.score) best = c;
    }
    if (best) return best.value;
  }
  const css = el.selector.css;
  if (css && !looksLikeXPath(css)) return css;
  return null;
}

/** Classify an extracted element into Persona's interactivity buckets. */
function classifyInteractivity(
  el: ExtractedElement
): EnrichedPageElement["interactivity"] {
  const tag = el.tag.toLowerCase();
  const role = el.interaction.role ?? el.attributes.role;

  if (tag === "a" && (el.interaction.nav || el.attributes.href != null)) {
    return "navigable";
  }
  if (tag === "input" || tag === "select" || tag === "textarea") return "input";
  if (
    role === "textbox" ||
    role === "combobox" ||
    role === "listbox" ||
    role === "spinbutton"
  ) {
    return "input";
  }
  if (el.interaction.change && !el.interaction.click) return "input";
  if (
    tag === "button" ||
    role === "button" ||
    el.interaction.click ||
    el.interaction.submit
  ) {
    return "clickable";
  }
  return "static";
}

/** Build the relevant-attribute bag, mirroring `dom-context.collectAttributes`. */
function collectAttributes(el: ExtractedElement): Record<string, string> {
  const attrs: Record<string, string> = { ...el.attributes };
  const role = el.interaction.role;
  if (role && !attrs.role) attrs.role = role;
  return attrs;
}

/**
 * Returns true when the element sits under `excludeSelector` (e.g. the widget host).
 * smart-dom-reader has no exclude option and pierces shadow DOM by default, so this
 * guards against the widget reading its own UI. The check is a substring match across
 * the element's candidate selectors and ancestor chain — robust for the default
 * `.persona-host` class guard.
 */
function isExcluded(el: ExtractedElement, excludeSelector: string): boolean {
  if (!excludeSelector) return false;
  const haystacks: Array<string | undefined> = [
    el.selector.css,
    el.selector.xpath,
    el.context.nearestForm,
    el.context.nearestSection,
    el.context.nearestMain,
    el.context.nearestNav,
    ...(el.selector.candidates?.map((c) => c.value) ?? []),
    ...el.context.parentChain
  ];
  return haystacks.some((h) => !!h && h.includes(excludeSelector));
}

/**
 * Map a {@link SmartDOMResult} into Persona's {@link EnrichedPageElement}[] shape so it
 * can be formatted by `formatEnrichedContext` and consumed wherever the default
 * `collectEnrichedPageContext` output is.
 *
 * - Maps `interactive.{buttons, links, inputs, clickable}` and, when present and
 *   `includeSemantic` is not false, `semantic.{headings, images, tables, lists, articles}`.
 * - Chooses the best plain-CSS selector per element (skipping XPath / shadow-piercing
 *   selectors) so results stay actionable via `document.querySelector`.
 * - Drops elements under `excludeSelector` (default `.persona-host`).
 * - Deduplicates by selector and preserves discovery order (interactive before semantic).
 */
export function smartDomResultToEnriched(
  result: SmartDOMResult,
  opts: SmartDomAdapterOptions = {}
): EnrichedPageElement[] {
  const includeSemantic = opts.includeSemantic ?? true;
  const excludeSelector = opts.excludeSelector ?? ".persona-host";
  const maxTextLength = opts.maxTextLength ?? 200;

  const groups: ExtractedElement[][] = [
    result.interactive.buttons,
    result.interactive.links,
    result.interactive.inputs,
    result.interactive.clickable
  ];

  if (includeSemantic && result.semantic) {
    groups.push(
      result.semantic.headings,
      result.semantic.images,
      result.semantic.tables,
      result.semantic.lists,
      result.semantic.articles
    );
  }

  const out: EnrichedPageElement[] = [];
  const seen = new Set<string>();

  // Walk an element and any nested children. In full mode the library attaches
  // shadow-DOM descendants as `children` of semantic containers, so recursing here
  // is how those pierced elements surface. Returns false once the optional
  // maxElements cap is reached.
  const visit = (el: ExtractedElement): boolean => {
    if (isExcluded(el, excludeSelector)) return true;

    const selector = bestPlainCssSelector(el);
    if (selector && !seen.has(selector)) {
      seen.add(selector);
      out.push({
        selector,
        tagName: el.tag.toLowerCase(),
        text: (el.text ?? "").trim().substring(0, maxTextLength),
        role: el.interaction.role ?? el.attributes.role ?? null,
        interactivity: classifyInteractivity(el),
        attributes: collectAttributes(el)
      });
      if (opts.maxElements && out.length >= opts.maxElements) return false;
    }

    if (el.children) {
      for (const child of el.children) {
        if (!visit(child)) return false;
      }
    }
    return true;
  };

  for (const group of groups) {
    if (!group) continue;
    for (const el of group) {
      if (!visit(el)) return out;
    }
  }

  return out;
}
