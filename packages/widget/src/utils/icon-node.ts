import type { IconNode } from "lucide";

/**
 * Registry-free lucide icon renderer.
 *
 * Two ways to render an icon, chosen by how the name is known:
 * - Name is a LITERAL no config can override → import the icon's data from
 *   "lucide" (per-icon modules, tree-shakeable) and call `renderIconNode`.
 *   Bundles then carry only the glyphs they use — critical for lazy chunks,
 *   which would otherwise duplicate the whole ~21 kB registry (`noExternal`).
 * - Name is host-suppliable (config, mention providers, ComponentRenderers) →
 *   `renderLucideIcon` in `./icons`, which resolves strings against the
 *   curated registry. Chunk code must receive that resolver INJECTED (see
 *   approval-deps.ts), never import it.
 *
 * This module must never import `./icons` — that would drag the registry
 * back into every bundle that only needs `renderIconNode`.
 */
export const renderIconNode = (
  iconData: IconNode,
  size: number | string = 24,
  color: string = "currentColor",
  strokeWidth: number = 2
): SVGElement | null => {
  if (!Array.isArray(iconData)) return null;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", String(strokeWidth));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  // IconNode shape: [["path", {"d": "..."}], ["circle", {"cx": "..."}], ...]
  iconData.forEach((elementData) => {
    if (!Array.isArray(elementData) || elementData.length < 2) return;
    const tagName = elementData[0] as string;
    const attrs = elementData[1] as Record<string, string> | undefined;
    if (!attrs) return;
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attrs).forEach(([key, value]) => {
      // Skip 'stroke' so the parent SVG's stroke attribute drives color uniformly
      if (key !== "stroke") element.setAttribute(key, String(value));
    });
    svg.appendChild(element);
  });

  return svg;
};
