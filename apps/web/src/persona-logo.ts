/**
 * The persona.js mark (public/persona-js-icon.svg: the terminal chat bubble
 * with traffic lights, sparkle, and "js") as an inline SVG element. Inline, it
 * inherits `currentColor` for its ink and exposes the traffic lights
 * (`.persona-logo__light`) and sparkle (`.persona-logo__sparkle`) to CSS.
 *
 * Geometry is copied from public/persona-js-icon.svg; keep the two in sync.
 */

// Cropped to the bubble's bounds (x 14–86, y 20–96) plus stroke.
const MARK_SVG =
  '<svg viewBox="12 18 76 80" xmlns="http://www.w3.org/2000/svg" class="persona-logo" aria-hidden="true">' +
  '<path d="M26 20 L74 20 L86 32 L86 68 L74 80 L48 80 L24 96 L36 80 L26 80 L14 68 L14 32 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter"/>' +
  '<line x1="14" y1="34" x2="86" y2="34" stroke="currentColor" stroke-width="3"/>' +
  '<circle class="persona-logo__light" cx="31" cy="27" r="2.6" fill="#ff5f57"/>' +
  '<circle class="persona-logo__light" cx="39" cy="27" r="2.6" fill="#febc2e"/>' +
  '<circle class="persona-logo__light" cx="47" cy="27" r="2.6" fill="#28c840"/>' +
  '<path class="persona-logo__sparkle" d="M33 58.4 L34.564 61.436 L37.6 63 L34.564 64.564 L33 67.6 L31.436 64.564 L28.4 63 L31.436 61.436 Z" fill="currentColor"/>' +
  '<text x="56" y="66" text-anchor="middle" font-family="ui-monospace, \'SF Mono\', Menlo, monospace" font-weight="700" font-size="26" fill="currentColor">js</text>' +
  "</svg>";

/**
 * A fresh inline persona.js mark at `size` px (it's ~square). Sized inline,
 * not only by CSS, so it can never render at the SVG's default 300px width.
 */
export const createPersonaMark = (size: number, className?: string): SVGSVGElement => {
  const template = document.createElement("template");
  template.innerHTML = MARK_SVG;
  const svg = template.content.firstElementChild as SVGSVGElement;
  if (className) svg.classList.add(className);
  const width = ((size * 76) / 80).toFixed(1);
  svg.setAttribute("width", width);
  svg.setAttribute("height", String(size));
  svg.style.width = `${width}px`;
  svg.style.height = `${size}px`;
  return svg;
};
