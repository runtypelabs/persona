/**
 * The four lucide glyphs the Messages view needs, inlined.
 *
 * `utils/icons.ts` would drag the whole ~130-icon registry into this lazy
 * chunk; the chunk exists to stay small. Path data matches lucide 1:1.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const PATHS = {
  "arrow-left": ["m12 19-7-7 7-7", "M19 12H5"],
  "arrow-right": ["M5 12h14", "m12 5 7 7-7 7"],
  plus: ["M5 12h14", "M12 5v14"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  ellipsis: [] as string[],
} as const;

export type HistoryIconName = keyof typeof PATHS;

export function historyIcon(name: HistoryIconName, size = 20): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  if (name === "ellipsis") {
    for (const cx of [12, 19, 5]) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "1");
      svg.appendChild(circle);
    }
    return svg;
  }

  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
