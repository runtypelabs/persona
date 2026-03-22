/**
 * Enriched DOM context collection for providing richer page information to AI.
 *
 * Captures interactive elements, stable CSS selectors, ARIA roles, data attributes,
 * and visibility state — giving the LLM much better context than basic className/innerText.
 *
 * ## Modes
 *
 * - **structured** (default): collects candidates, scores them with optional {@link ParseRule}
 *   hooks, then applies `maxElements`. Rich containers (e.g. product cards) can surface
 *   before unrelated static noise.
 * - **simple**: legacy behavior — cap during traversal, interactive-first ordering, no rule
 *   scoring or {@link EnrichedPageElement.formattedSummary}.
 */

export interface EnrichedPageElement {
  /** Stable CSS selector the LLM can use directly */
  selector: string;
  /** Lowercase tag name */
  tagName: string;
  /** Visible text content, trimmed */
  text: string;
  /** ARIA role or null */
  role: string | null;
  /** Interactivity classification */
  interactivity: "clickable" | "input" | "navigable" | "static";
  /** Relevant attributes: id, data-*, href, aria-label, type, value, name */
  attributes: Record<string, string>;
  /**
   * When set (structured mode + matching rule), {@link formatEnrichedContext} prefers this
   * markdown-like line instead of raw `text`.
   */
  formattedSummary?: string;
}

/** How DOM context is collected and formatted. */
export type DomContextMode = "simple" | "structured";

/**
 * Options that control collection limits, visibility, and mode.
 * Prefer nesting these under {@link DomContextOptions.options}; top-level fields remain
 * supported for backward compatibility.
 */
export interface ParseOptionsConfig {
  /**
   * `structured` (default): score candidates with rules, then apply `maxElements`.
   * `simple`: legacy traversal cap and ordering only — rules are ignored (with a warning
   * if `rules` was passed on {@link DomContextOptions}).
   */
  mode?: DomContextMode;
  /** Maximum number of elements to return. Default: 80 */
  maxElements?: number;
  /** CSS selector for elements to exclude (e.g. the widget host). Default: '.persona-host' */
  excludeSelector?: string;
  /** Maximum text length per element. Default: 200 */
  maxTextLength?: number;
  /** Only include visible elements. Default: true */
  visibleOnly?: boolean;
  /** Root element to walk. Default: document.body */
  root?: HTMLElement;
  /**
   * Maximum candidates gathered before scoring (structured mode only).
   * Default: `max(500, maxElements * 10)`.
   */
  maxCandidates?: number;
}

export interface RuleScoringContext {
  doc: Document;
  maxTextLength: number;
}

/**
 * Extensible rule for structured DOM context: scoring, descendant suppression, and
 * optional formatted output.
 */
export interface ParseRule {
  /** Stable id for debugging and tests */
  id: string;
  /**
   * Score bonus when this rule applies to the element (0 when it does not).
   * Higher scores are kept first when applying `maxElements`.
   */
  scoreElement(
    el: HTMLElement,
    enriched: EnrichedPageElement,
    ctx: RuleScoringContext
  ): number;
  /**
   * When `owner` is kept in the final set and matched this rule for formatting,
   * return true to drop `descendant` (redundant price text, CTAs summarized on the card, etc.).
   */
  shouldSuppressDescendant?(
    owner: HTMLElement,
    descendant: HTMLElement,
    descendantEnriched: EnrichedPageElement
  ): boolean;
  /**
   * Markdown-like summary for the LLM. Only used when `scoreElement` &gt; 0 for this rule.
   */
  formatSummary?(
    el: HTMLElement,
    enriched: EnrichedPageElement,
    ctx: RuleScoringContext
  ): string | null;
}

export interface DomContextOptions {
  /** Nested parse options (mode, limits, root). Merged with legacy top-level fields. */
  options?: ParseOptionsConfig;
  /** Custom rules for structured mode. Default: {@link defaultParseRules} */
  rules?: ParseRule[];
  /** @inheritdoc ParseOptionsConfig.maxElements */
  maxElements?: number;
  /** @inheritdoc ParseOptionsConfig.excludeSelector */
  excludeSelector?: string;
  /** @inheritdoc ParseOptionsConfig.maxTextLength */
  maxTextLength?: number;
  /** @inheritdoc ParseOptionsConfig.visibleOnly */
  visibleOnly?: boolean;
  /** @inheritdoc ParseOptionsConfig.root */
  root?: HTMLElement;
}

export interface FormatEnrichedContextOptions {
  /** When `simple`, ignore {@link EnrichedPageElement.formattedSummary}. Default: structured */
  mode?: DomContextMode;
}

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "path",
  "meta",
  "link",
  "br",
  "hr",
]);

const INTERACTIVE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "option",
  "switch",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "slider",
  "spinbutton",
  "textbox",
]);

/** Class / id / data-* value hints for card-like containers */
const CARD_HINT_RE = /\b(product|card|item|listing|result)\b/i;

/** Currency-like text in subtree */
const CURRENCY_RE =
  /\$[\d,]+(?:\.\d{2})?|€[\d,]+(?:\.\d{2})?|£[\d,]+(?:\.\d{2})?|USD\s*[\d,]+(?:\.\d{2})?/i;

const BASE_SCORE_INTERACTIVE = 3000;
const BASE_SCORE_STATIC = 100;

function hasCardHint(el: HTMLElement): boolean {
  const cls = typeof el.className === "string" ? el.className : "";
  if (CARD_HINT_RE.test(cls)) return true;
  if (el.id && CARD_HINT_RE.test(el.id)) return true;
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name.startsWith("data-") && CARD_HINT_RE.test(a.value)) return true;
  }
  return false;
}

function subtreeHasCurrency(el: HTMLElement): boolean {
  return CURRENCY_RE.test((el.textContent ?? "").trim());
}

function subtreeHasNonTrivialLink(el: HTMLElement): boolean {
  const anchors = el.querySelectorAll("a[href]");
  for (let i = 0; i < anchors.length; i++) {
    const href = (anchors[i] as HTMLAnchorElement).getAttribute("href") ?? "";
    if (href && href !== "#" && !href.toLowerCase().startsWith("javascript:"))
      return true;
  }
  return false;
}

function subtreeHasButtonLike(el: HTMLElement): boolean {
  return !!el.querySelector(
    'button, [role="button"], input[type="submit"], input[type="button"]'
  );
}

function extractFirstPrice(text: string): string | null {
  const m = text.match(CURRENCY_RE);
  return m ? m[0] : null;
}

function extractTitleAndHref(el: HTMLElement): { title: string; href: string | null } {
  const link =
    el.querySelector(
      ".product-title a, h1 a, h2 a, h3 a, h4 a, .title a, a[href]"
    ) ?? el.querySelector("a[href]");
  if (link && link.textContent?.trim()) {
    const href = (link as HTMLAnchorElement).getAttribute("href");
    return {
      title: link.textContent.trim(),
      href: href && href !== "#" ? href : null,
    };
  }
  const heading = el.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading?.textContent?.trim()) {
    return { title: heading.textContent.trim(), href: null };
  }
  return { title: "", href: null };
}

function extractCtaLabels(el: HTMLElement): string[] {
  const labels: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !labels.includes(t)) labels.push(t);
  };
  el.querySelectorAll("button").forEach((b) => push(b.textContent ?? ""));
  el.querySelectorAll('[role="button"]').forEach((b) => push(b.textContent ?? ""));
  el.querySelectorAll('input[type="submit"], input[type="button"]').forEach((inp) => {
    push((inp as HTMLInputElement).value ?? "");
  });
  return labels.slice(0, 6);
}

export const COMMERCE_CARD_RULE_ID = "commerce-card";
export const RESULT_CARD_RULE_ID = "result-card";

function commerceCardScore(el: HTMLElement): number {
  if (!hasCardHint(el)) return 0;
  if (!subtreeHasCurrency(el)) return 0;
  if (!subtreeHasNonTrivialLink(el) && !subtreeHasButtonLike(el)) return 0;
  return 5200;
}

function resultCardScore(el: HTMLElement): number {
  if (!hasCardHint(el)) return 0;
  if (subtreeHasCurrency(el)) return 0;
  if (!subtreeHasNonTrivialLink(el)) return 0;
  const text = (el.textContent ?? "").trim();
  if (text.length < 20) return 0;
  const hasTitle =
    !!el.querySelector("h1, h2, h3, h4, h5, h6, .title") ||
    !!el.querySelector(".snippet, .description, p");
  if (!hasTitle) return 0;
  return 2800;
}

/** Default structured rules: commerce-style cards and generic search/result rows. */
export const defaultParseRules: ParseRule[] = [
  {
    id: COMMERCE_CARD_RULE_ID,
    scoreElement(el) {
      return commerceCardScore(el);
    },
    shouldSuppressDescendant(owner, descendant, enriched) {
      if (descendant === owner || !owner.contains(descendant)) return false;
      if (enriched.interactivity === "static") {
        const t = enriched.text.trim();
        if (t.length === 0) return true;
        if (CURRENCY_RE.test(t) && t.length < 32) return true;
        return false;
      }
      return true;
    },
    formatSummary(el, enriched) {
      if (commerceCardScore(el) === 0) return null;
      const { title, href } = extractTitleAndHref(el);
      const price =
        extractFirstPrice((el.textContent ?? "").trim()) ??
        extractFirstPrice(enriched.text) ??
        "";
      const ctas = extractCtaLabels(el);
      const head =
        href && title
          ? `[${title}](${href})${price ? ` — ${price}` : ""}`
          : title
            ? `${title}${price ? ` — ${price}` : ""}`
            : price || enriched.text.trim().slice(0, 120);
      const lines = [
        head,
        `selector: ${enriched.selector}`,
        ctas.length ? `actions: ${ctas.join(", ")}` : "",
      ].filter(Boolean);
      return lines.join("\n");
    },
  },
  {
    id: RESULT_CARD_RULE_ID,
    scoreElement(el) {
      return resultCardScore(el);
    },
    formatSummary(el, enriched) {
      if (resultCardScore(el) === 0) return null;
      const { title, href } = extractTitleAndHref(el);
      const head =
        href && title
          ? `[${title}](${href})`
          : title || enriched.text.trim().slice(0, 120);
      const lines = [head, `selector: ${enriched.selector}`].filter(Boolean);
      return lines.join("\n");
    },
  },
];

interface ResolvedDomContextConfig {
  mode: DomContextMode;
  maxElements: number;
  maxCandidates: number;
  excludeSelector: string;
  maxTextLength: number;
  visibleOnly: boolean;
  root: HTMLElement | undefined;
  rules: ParseRule[];
}

function warnSimpleWithRules(): void {
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      "[persona] collectEnrichedPageContext: options.mode is \"simple\" but `rules` were provided; rules are ignored."
    );
  }
}

function resolveDomContextConfig(options: DomContextOptions): ResolvedDomContextConfig {
  const nested = options.options ?? {};
  const maxElements =
    nested.maxElements ?? options.maxElements ?? 80;
  const excludeSelector =
    nested.excludeSelector ?? options.excludeSelector ?? ".persona-host";
  const maxTextLength =
    nested.maxTextLength ?? options.maxTextLength ?? 200;
  const visibleOnly =
    nested.visibleOnly ?? options.visibleOnly ?? true;
  const root = nested.root ?? options.root;
  const mode: DomContextMode = nested.mode ?? "structured";
  const maxCandidates =
    nested.maxCandidates ?? Math.max(500, maxElements * 10);

  let rules = options.rules ?? defaultParseRules;
  if (mode === "simple" && options.rules && options.rules.length > 0) {
    warnSimpleWithRules();
    rules = [];
  } else if (mode === "simple") {
    rules = [];
  }

  return {
    mode,
    maxElements,
    maxCandidates,
    excludeSelector,
    maxTextLength,
    visibleOnly,
    root,
    rules,
  };
}

/**
 * Escape a string for use in CSS selectors. Falls back to simple escaping
 * when CSS.escape is not available (e.g. in jsdom).
 */
function cssEscape(str: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(str);
  }
  return str.replace(/([^\w-])/g, "\\$1");
}

const DATA_ATTR_PRIORITY = [
  "data-testid",
  "data-product",
  "data-action",
  "data-id",
  "data-name",
  "data-type",
];

/**
 * Classify an element's interactivity type.
 */
function classifyInteractivity(
  el: HTMLElement
): EnrichedPageElement["interactivity"] {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");

  if (tag === "a" && el.hasAttribute("href")) return "navigable";
  if (tag === "input" || tag === "select" || tag === "textarea") return "input";
  if (
    role === "textbox" ||
    role === "combobox" ||
    role === "listbox" ||
    role === "spinbutton"
  )
    return "input";
  if (tag === "button" || role === "button") return "clickable";
  if (
    INTERACTIVE_TAGS.has(tag) ||
    (role && INTERACTIVE_ROLES.has(role)) ||
    el.hasAttribute("tabindex") ||
    el.hasAttribute("onclick") ||
    el.getAttribute("contenteditable") === "true"
  )
    return "clickable";

  return "static";
}

/**
 * Check if an element is visible.
 * Uses a defensive approach: only marks as invisible when we have positive evidence
 * of hidden state (display:none, visibility:hidden, hidden attribute).
 * offsetParent is unreliable in non-layout environments (e.g. jsdom).
 */
function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;

  try {
    const style = getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
  } catch {
    // getComputedStyle can fail in some environments — assume visible
  }

  if (el.style.display === "none") return false;
  if (el.style.visibility === "hidden") return false;

  return true;
}

/**
 * Collect relevant attributes from an element.
 */
function collectAttributes(el: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};

  const id = el.id;
  if (id) attrs["id"] = id;

  const href = el.getAttribute("href");
  if (href) attrs["href"] = href;

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) attrs["aria-label"] = ariaLabel;

  const type = el.getAttribute("type");
  if (type) attrs["type"] = type;

  const value = el.getAttribute("value");
  if (value) attrs["value"] = value;

  const name = el.getAttribute("name");
  if (name) attrs["name"] = name;

  const role = el.getAttribute("role");
  if (role) attrs["role"] = role;

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.startsWith("data-")) {
      attrs[attr.name] = attr.value;
    }
  }

  return attrs;
}

/**
 * Generate a stable, unique CSS selector for an element.
 * Priority: #id → [data-testid]/[data-product] → tag.classes with :nth-of-type()
 */
export function generateStableSelector(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();

  if (el.id) {
    const sel = `#${cssEscape(el.id)}`;
    try {
      if (el.ownerDocument.querySelectorAll(sel).length === 1) return sel;
    } catch {
      // invalid selector, fall through
    }
  }

  for (const attr of DATA_ATTR_PRIORITY) {
    const val = el.getAttribute(attr);
    if (val) {
      const sel = `${tag}[${attr}="${cssEscape(val)}"]`;
      try {
        if (el.ownerDocument.querySelectorAll(sel).length === 1) return sel;
      } catch {
        // invalid selector, fall through
      }
    }
  }

  const classes = Array.from(el.classList)
    .filter((c) => c && !c.startsWith("persona-"))
    .slice(0, 3);

  if (classes.length > 0) {
    const classSel = `${tag}.${classes.map((c) => cssEscape(c)).join(".")}`;
    try {
      if (el.ownerDocument.querySelectorAll(classSel).length === 1) return classSel;
    } catch {
      // fall through
    }

    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
      const index = siblings.indexOf(el);
      if (index >= 0) {
        const nthSel = `${classSel}:nth-of-type(${index + 1})`;
        try {
          if (el.ownerDocument.querySelectorAll(nthSel).length === 1) return nthSel;
        } catch {
          // fall through
        }
      }
    }
  }

  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
    const index = siblings.indexOf(el);
    if (index >= 0) {
      return `${tag}:nth-of-type(${index + 1})`;
    }
  }

  return tag;
}

function baseInteractivityScore(
  interactivity: EnrichedPageElement["interactivity"]
): number {
  return interactivity === "static" ? BASE_SCORE_STATIC : BASE_SCORE_INTERACTIVE;
}

interface ScoredCandidate {
  el: HTMLElement;
  domIndex: number;
  enriched: EnrichedPageElement;
  score: number;
  formattingRule: ParseRule | null;
}

function buildEnriched(
  el: HTMLElement,
  maxTextLength: number
): EnrichedPageElement {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").trim().substring(0, maxTextLength);
  return {
    selector: generateStableSelector(el),
    tagName: tag,
    text,
    role: el.getAttribute("role"),
    interactivity: classifyInteractivity(el),
    attributes: collectAttributes(el),
  };
}

function scoreCandidate(
  el: HTMLElement,
  enriched: EnrichedPageElement,
  rules: ParseRule[],
  ctx: RuleScoringContext
): { score: number; formattingRule: ParseRule | null } {
  let score = baseInteractivityScore(enriched.interactivity);
  let formattingRule: ParseRule | null = null;
  for (const rule of rules) {
    const bonus = rule.scoreElement(el, enriched, ctx);
    if (bonus > 0) {
      score += bonus;
      if (rule.formatSummary && !formattingRule) formattingRule = rule;
    }
  }
  return { score, formattingRule };
}

function shouldSuppress(
  kept: ScoredCandidate[],
  cand: ScoredCandidate
): boolean {
  for (const k of kept) {
    if (cand.el === k.el) continue;
    if (!k.formattingRule?.shouldSuppressDescendant) continue;
    if (!k.el.contains(cand.el)) continue;
    if (
      k.formattingRule.shouldSuppressDescendant(
        k.el,
        cand.el,
        cand.enriched
      )
    )
      return true;
  }
  return false;
}

function collectStructured(
  cfg: ResolvedDomContextConfig,
  rootEl: HTMLElement
): EnrichedPageElement[] {
  const ctx: RuleScoringContext = {
    doc: rootEl.ownerDocument,
    maxTextLength: cfg.maxTextLength,
  };

  const seenSelectors = new Set<string>();
  const raw: ScoredCandidate[] = [];
  let domIndex = 0;

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, null);
  let node: Node | null = walker.currentNode;

  while (node && raw.length < cfg.maxCandidates) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (SKIP_TAGS.has(tag)) {
        node = walker.nextNode();
        continue;
      }

      if (cfg.excludeSelector) {
        try {
          if (el.closest(cfg.excludeSelector)) {
            node = walker.nextNode();
            continue;
          }
        } catch {
          // invalid selector
        }
      }

      if (cfg.visibleOnly && !isElementVisible(el)) {
        node = walker.nextNode();
        continue;
      }

      const enriched = buildEnriched(el, cfg.maxTextLength);
      const hasText = enriched.text.length > 0;
      const hasMeaningfulAttrs =
        Object.keys(enriched.attributes).length > 0 &&
        !Object.keys(enriched.attributes).every((k) => k === "role");

      if (!hasText && !hasMeaningfulAttrs) {
        node = walker.nextNode();
        continue;
      }

      if (seenSelectors.has(enriched.selector)) {
        node = walker.nextNode();
        continue;
      }
      seenSelectors.add(enriched.selector);

      const { score, formattingRule } = scoreCandidate(
        el,
        enriched,
        cfg.rules,
        ctx
      );
      raw.push({ el, domIndex, enriched, score, formattingRule });
      domIndex += 1;
    }
    node = walker.nextNode();
  }

  raw.sort((a, b) => {
    const sa = a.enriched.interactivity === "static" ? 1 : 0;
    const sb = b.enriched.interactivity === "static" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (b.score !== a.score) return b.score - a.score;
    return a.domIndex - b.domIndex;
  });

  const kept: ScoredCandidate[] = [];
  for (const cand of raw) {
    if (kept.length >= cfg.maxElements) break;
    if (shouldSuppress(kept, cand)) continue;
    kept.push(cand);
  }

  kept.sort((a, b) => {
    const sa = a.enriched.interactivity === "static" ? 1 : 0;
    const sb = b.enriched.interactivity === "static" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (sa === 1 && b.score !== a.score) return b.score - a.score;
    return a.domIndex - b.domIndex;
  });

  return kept.map((c) => {
    let formattedSummary: string | undefined;
    if (c.formattingRule?.formatSummary) {
      const line = c.formattingRule.formatSummary(c.el, c.enriched, ctx);
      if (line) formattedSummary = line;
    }
    const out: EnrichedPageElement = { ...c.enriched };
    if (formattedSummary) out.formattedSummary = formattedSummary;
    return out;
  });
}

function collectSimple(
  cfg: ResolvedDomContextConfig,
  rootEl: HTMLElement
): EnrichedPageElement[] {
  const elements: EnrichedPageElement[] = [];
  const seenSelectors = new Set<string>();

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, null);
  let node: Node | null = walker.currentNode;

  while (node && elements.length < cfg.maxElements) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (SKIP_TAGS.has(tag)) {
        node = walker.nextNode();
        continue;
      }

      if (cfg.excludeSelector) {
        try {
          if (el.closest(cfg.excludeSelector)) {
            node = walker.nextNode();
            continue;
          }
        } catch {
          // invalid selector
        }
      }

      if (cfg.visibleOnly && !isElementVisible(el)) {
        node = walker.nextNode();
        continue;
      }

      const enriched = buildEnriched(el, cfg.maxTextLength);
      const hasText = enriched.text.length > 0;
      const hasMeaningfulAttrs =
        Object.keys(enriched.attributes).length > 0 &&
        !Object.keys(enriched.attributes).every((k) => k === "role");

      if (!hasText && !hasMeaningfulAttrs) {
        node = walker.nextNode();
        continue;
      }

      if (!seenSelectors.has(enriched.selector)) {
        seenSelectors.add(enriched.selector);
        elements.push(enriched);
      }
    }
    node = walker.nextNode();
  }

  const interactive: EnrichedPageElement[] = [];
  const staticEls: EnrichedPageElement[] = [];
  for (const el of elements) {
    if (el.interactivity !== "static") interactive.push(el);
    else staticEls.push(el);
  }

  return [...interactive, ...staticEls].slice(0, cfg.maxElements);
}

/**
 * Collect enriched page context from the DOM.
 *
 * - **Default (structured):** walks up to `maxCandidates` nodes, scores with
 *   {@link defaultParseRules} (or `rules`), suppresses redundant descendants when a
 *   formatting rule matches, then keeps the top `maxElements` by score (DOM order tie-break).
 * - **simple:** legacy path — stops once `maxElements` nodes are collected during traversal
 *   and sorts interactive before static.
 *
 * Pass `options: { mode: "simple" }` to disable rules. If `mode` is `simple` and `rules` is
 * non-empty, rules are ignored and a console warning is emitted.
 */
export function collectEnrichedPageContext(
  options: DomContextOptions = {}
): EnrichedPageElement[] {
  const cfg = resolveDomContextConfig(options);
  const rootEl = cfg.root ?? document.body;
  if (!rootEl) return [];

  if (cfg.mode === "simple") {
    return collectSimple(cfg, rootEl);
  }
  return collectStructured(cfg, rootEl);
}

const TEXT_PREVIEW_LEN = 100;

/**
 * Format enriched page elements as a structured string for LLM consumption.
 * When `mode` is structured (default) and elements include {@link EnrichedPageElement.formattedSummary},
 * those render under **Structured summaries** before the usual interactivity groups.
 */
export function formatEnrichedContext(
  elements: EnrichedPageElement[],
  options: FormatEnrichedContextOptions = {}
): string {
  if (elements.length === 0) {
    return "No page elements found.";
  }

  const mode: DomContextMode = options.mode ?? "structured";
  const sections: string[] = [];

  if (mode === "structured") {
    const summaries = elements
      .map((el) => el.formattedSummary)
      .filter((s): s is string => !!s && s.length > 0);
    if (summaries.length > 0) {
      sections.push(
        `Structured summaries:\n${summaries.map((s) => `- ${s.split("\n").join("\n  ")}`).join("\n")}`
      );
    }
  }

  const groups: Record<string, EnrichedPageElement[]> = {
    clickable: [],
    navigable: [],
    input: [],
    static: [],
  };

  for (const el of elements) {
    if (mode === "structured" && el.formattedSummary) continue;
    groups[el.interactivity].push(el);
  }

  if (groups.clickable.length > 0) {
    const lines = groups.clickable.map(
      (el) =>
        `- ${el.selector}: "${el.text.substring(0, TEXT_PREVIEW_LEN)}" (clickable)`
    );
    sections.push(`Interactive elements:\n${lines.join("\n")}`);
  }

  if (groups.navigable.length > 0) {
    const lines = groups.navigable.map(
      (el) =>
        `- ${el.selector}${el.attributes.href ? `[href="${el.attributes.href}"]` : ""}: "${el.text.substring(0, TEXT_PREVIEW_LEN)}" (navigable)`
    );
    sections.push(`Navigation links:\n${lines.join("\n")}`);
  }

  if (groups.input.length > 0) {
    const lines = groups.input.map(
      (el) =>
        `- ${el.selector}${el.attributes.type ? `[type="${el.attributes.type}"]` : ""}: "${el.text.substring(0, TEXT_PREVIEW_LEN)}" (input)`
    );
    sections.push(`Form inputs:\n${lines.join("\n")}`);
  }

  if (groups.static.length > 0) {
    const lines = groups.static.map(
      (el) => `- ${el.selector}: "${el.text.substring(0, TEXT_PREVIEW_LEN)}"`
    );
    sections.push(`Content:\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}
