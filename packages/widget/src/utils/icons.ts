import * as icons from "lucide";
import type { IconNode } from "lucide";

/**
 * Renders a Lucide icon as an inline SVG element
 * This approach requires no CSS and works on any page
 * 
 * @param iconName - The Lucide icon name in kebab-case (e.g., "arrow-up")
 * @param size - The size of the icon (default: 24)
 * @param color - The stroke color (default: "currentColor")
 * @param strokeWidth - The stroke width (default: 2)
 * @returns SVGElement or null if icon not found
 */
export const renderLucideIcon = (
  iconName: string,
  size: number | string = 24,
  color: string = "currentColor",
  strokeWidth: number = 2
): SVGElement | null => {
  try {
    // Convert kebab-case to PascalCase (e.g., "arrow-up" -> "ArrowUp")
    const pascalName = iconName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
    
    // Lucide's icons object contains IconNode data directly, not functions
    const iconData = (icons as Record<string, IconNode>)[pascalName] as IconNode;
    
    if (!iconData) {
      console.warn(`Lucide icon "${iconName}" not found (tried "${pascalName}"). Available icons: https://lucide.dev/icons`);
      return null;
    }

    return createSvgFromIconData(iconData, size, color, strokeWidth);
  } catch (error) {
    console.warn(`Failed to render Lucide icon "${iconName}":`, error);
    return null;
  }
};

/**
 * Helper function to create SVG from IconNode data
 */
function createSvgFromIconData(
  iconData: IconNode,
  size: number | string,
  color: string,
  strokeWidth: number
): SVGElement | null {
  if (!iconData || !Array.isArray(iconData)) {
    return null;
  }

  // Create SVG element
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
  
  // Render elements from icon data
  // IconNode format: [["path", {"d": "..."}], ["rect", {"x": "...", "y": "..."}], ...]
  iconData.forEach((elementData) => {
    if (Array.isArray(elementData) && elementData.length >= 2) {
      const tagName = elementData[0] as string;
      const attrs = elementData[1] as Record<string, string>;
      
      if (attrs) {
        // Create the appropriate SVG element (path, rect, circle, ellipse, line, etc.)
        const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
        
        // Apply all attributes, but skip 'stroke' (we want to use the parent SVG's stroke for consistent coloring)
        Object.entries(attrs).forEach(([key, value]) => {
          if (key !== "stroke") {
            element.setAttribute(key, String(value));
          }
        });
        
        svg.appendChild(element);
      }
    }
  });
  
  return svg;
}

