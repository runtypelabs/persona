import DOMPurify from "dompurify";

/**
 * A function that sanitizes an HTML string, returning safe HTML.
 */
export type SanitizeFunction = (html: string) => string;

const DEFAULT_PURIFY_CONFIG: DOMPurify.Config = {
  // Tags safe for markdown-rendered content
  ALLOWED_TAGS: [
    // Headings & structure
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "div", "span",
    // Lists
    "ul", "ol", "li", "dl", "dt", "dd",
    // Inline formatting
    "strong", "em", "b", "i", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
    "abbr", "kbd", "var", "samp", "code",
    // Links & media
    "a", "img",
    // Block elements
    "blockquote", "pre", "details", "summary",
    // Tables
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    // Forms (used by widget directive system)
    "input", "label", "select", "option", "textarea", "button",
  ],
  ALLOWED_ATTR: [
    // Link/media attributes
    "href", "src", "alt", "title", "target", "rel", "loading", "width", "height",
    // Table attributes
    "colspan", "rowspan", "scope",
    // Styling & identity
    "class", "id",
    // Form attributes
    "type", "name", "value", "placeholder", "disabled", "checked", "for",
    // Accessibility
    "aria-label", "aria-hidden", "aria-expanded", "role", "tabindex",
    // Widget-internal data attributes
    "data-tv-form", "data-message-id", "data-persona-component-directive",
    "data-preserve-animation", "data-persona-instance",
  ],
};

/** Raster image data URI pattern — blocks SVG and other non-image types. */
const SAFE_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp|bmp|x-icon|avif)/i;

/**
 * Creates the default DOMPurify-based sanitizer.
 * Uses the global window when available (browser).
 */
export const createDefaultSanitizer = (): SanitizeFunction => {
  // DOMPurify needs a DOM context. In the browser, pass `window`.
  // The widget only runs in browsers, so `window` is always available at runtime.
  const purify = DOMPurify(typeof window !== "undefined" ? window : (undefined as never));

  // Hook: strip data:image/svg+xml and other unsafe data: URIs from src/href
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "src" || data.attrName === "href") {
      const val = data.attrValue;
      if (val.toLowerCase().startsWith("data:") && !SAFE_DATA_URI.test(val)) {
        data.attrValue = "";
        data.keepAttr = false;
      }
    }
  });

  return (html: string): string => purify.sanitize(html, DEFAULT_PURIFY_CONFIG) as string;
};

/**
 * Resolves a `sanitize` config value into a concrete function or null.
 *
 * - `undefined` / `true` → built-in DOMPurify sanitizer
 * - `false` → `null` (no sanitization)
 * - custom function → returned as-is
 */
export const resolveSanitizer = (
  option: boolean | SanitizeFunction | undefined,
): SanitizeFunction | null => {
  if (option === false) return null;
  if (typeof option === "function") return option;
  return createDefaultSanitizer();
};
