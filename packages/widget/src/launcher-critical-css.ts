/**
 * The collapsed launcher's own share of `widget.css`, so the critical bundle
 * paints without waiting for the full stylesheet.
 *
 * The build swaps this placeholder for the rules the launcher bundle can match
 * (`scripts/launcher-critical-css.mjs`). They are copied from `widget.css`
 * unchanged and in order, so nothing restyles when the full stylesheet arrives
 * later. Unbundled source (tests, dev servers) keeps the placeholder, and
 * callers fall back to waiting for `widget.css`.
 */
const CRITICAL_CSS: string = "__PERSONA_LAUNCHER_CRITICAL_CSS__";

/** Marks the injected `<style>`; the installer and tests look it up by this. */
export const CRITICAL_STYLE_ATTR = "data-persona-launcher-css";

/** The full stylesheet, as the installer or the host page links it. */
const FULL_STYLESHEET = 'link[data-persona],link[href*="widget.css"]';

const loadedStylesheet = (doc: Document): boolean =>
  !!doc.head.querySelector<HTMLLinkElement>(FULL_STYLESHEET)?.sheet;

/**
 * Make sure the collapsed launcher is styled, and say whether it is.
 *
 * Returns `false` when this bundle carries no rules or the page refuses inline
 * styles (a `style-src` policy without `'unsafe-inline'`); the caller must then
 * wait for `widget.css` before mounting, as earlier installers always did.
 * `css` is the embedded stylesheet; tests pass their own.
 */
export const installCriticalStyles = (doc: Document = document, css = CRITICAL_CSS): boolean => {
  if (loadedStylesheet(doc)) return true;
  const existing = doc.head.querySelector<HTMLStyleElement>(`style[${CRITICAL_STYLE_ATTR}]`);
  if (existing) return !!existing.sheet;
  if (css.startsWith("__")) return false;
  const style = doc.createElement("style");
  style.setAttribute(CRITICAL_STYLE_ATTR, "");
  style.textContent = css;
  doc.head.appendChild(style);
  // A blocked inline style is attached but never parsed.
  if (style.sheet) return true;
  style.remove();
  return false;
};

/**
 * Drop the critical rules once `widget.css` has taken over (the handoff to the
 * full widget). Kept when the full stylesheet is not applied, so a launcher
 * that is still on screen never loses its styling.
 */
export const removeCriticalStyles = (doc: Document = document): void => {
  if (loadedStylesheet(doc)) doc.head.querySelector(`style[${CRITICAL_STYLE_ATTR}]`)?.remove();
};
