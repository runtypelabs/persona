/**
 * The lucide glyphs the Messages view needs, inlined.
 *
 * `utils/icons.ts` would drag the whole ~130-icon registry into this lazy
 * chunk; the chunk exists to stay small. Path data matches lucide 1:1.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const PATHS = {
  "arrow-left": ["m12 19-7-7 7-7", "M19 12H5"],
  plus: ["M5 12h14", "M12 5v14"],
  // Rendered filled at ~11px, so a plain 5-point polygon beats lucide's long
  // rounded path byte-for-byte with no visible difference.
  star: ["m12 2 2.9 6.2 6.8.7-5.1 4.5 1.4 6.6-6-3.4-6 3.4 1.4-6.6-5.1-4.5 6.8-.7z"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  // PanelLeft is a rounded rect plus this divider; the rect is added below.
  "panel-left": ["M9 3v18"],
  // Monitor is a rounded rect (added below) plus the stand.
  monitor: ["M8 21h8", "M12 17v4"],
  ellipsis: [] as string[],
} as const;

/** The rounded-rect halves of the two-part glyphs above. */
const RECTS: Partial<Record<keyof typeof PATHS, [number, number, number, number]>> = {
  "panel-left": [3, 3, 18, 18],
  monitor: [2, 3, 20, 14],
};

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

  const box = RECTS[name];
  if (box) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(box[0]));
    rect.setAttribute("y", String(box[1]));
    rect.setAttribute("width", String(box[2]));
    rect.setAttribute("height", String(box[3]));
    rect.setAttribute("rx", "2");
    svg.appendChild(rect);
  }

  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
