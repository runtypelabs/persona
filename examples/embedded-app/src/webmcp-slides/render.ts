import type { Slide, SlideElement, Theme } from "./types";
import { SLIDE_H, SLIDE_W } from "./types";
import { resolveColor, resolveFont } from "./themes";

// Pure slide rendering: no event listeners, no store access. Reused by three
// consumers: the editor canvas (which layers an interaction overlay on top),
// the sorter rail (scaled down with a CSS transform), and presenter mode
// (scaled to the viewport). Full re-render on every store change is cheap:
// decks are a handful of slides with tens of elements.

const SVG_NS = "http://www.w3.org/2000/svg";

const IMAGE_PLACEHOLDER_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#cbd5e1"/><path d="M0.5 2.4 1.5 1.3 2.3 2 2.9 1.4 3.5 2.4z" fill="#64748b"/><circle cx="1.1" cy="0.8" r="0.3" fill="#64748b"/></svg>`,
);

export const renderElement = (
  element: SlideElement,
  theme: Theme,
): HTMLElement => {
  const node = document.createElement(element.type === "image" ? "div" : "div");
  node.className = `wm-element wm-element-${element.type}`;
  node.dataset.elementId = element.id;
  node.style.left = `${element.x}px`;
  node.style.top = `${element.y}px`;
  node.style.width = `${element.w}px`;
  node.style.height = `${element.h}px`;
  node.style.zIndex = String(element.z);
  if (element.rotation) {
    node.style.transform = `rotate(${element.rotation}deg)`;
  }

  switch (element.type) {
    case "text": {
      node.textContent = element.text ?? "";
      node.style.fontSize = `${element.fontSize ?? 18}px`;
      node.style.fontFamily = resolveFont(element.fontFamily, theme) ?? theme.fonts.body;
      node.style.fontWeight = String(element.fontWeight ?? 400);
      node.style.color = resolveColor(element.color, theme) ?? theme.colors.text;
      node.style.textAlign = element.align ?? "left";
      break;
    }
    case "rect":
    case "ellipse": {
      const fill = resolveColor(element.fill, theme);
      if (fill) node.style.background = fill;
      const stroke = resolveColor(element.stroke, theme);
      if (stroke) {
        node.style.border = `${element.strokeWidth ?? 1}px solid ${stroke}`;
      }
      if (element.type === "ellipse") node.style.borderRadius = "50%";
      break;
    }
    case "line": {
      // Lines draw from the top-left to the bottom-right corner of their
      // bounding box (an SVG keeps stroke endpoints exact at any angle).
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute(
        "viewBox",
        `0 0 ${Math.max(element.w, 1)} ${Math.max(element.h, 1)}`,
      );
      svg.setAttribute("preserveAspectRatio", "none");
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", String(Math.max(element.w, 1)));
      line.setAttribute("y2", String(Math.max(element.h, 1)));
      line.setAttribute(
        "stroke",
        resolveColor(element.stroke, theme) ?? theme.colors.text,
      );
      line.setAttribute("stroke-width", String(element.strokeWidth ?? 2));
      svg.appendChild(line);
      node.appendChild(svg);
      break;
    }
    case "image": {
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.src =
        !element.src || element.src === "placeholder"
          ? `data:image/svg+xml,${IMAGE_PLACEHOLDER_SVG}`
          : element.src;
      img.onerror = () => {
        img.onerror = null;
        img.src = `data:image/svg+xml,${IMAGE_PLACEHOLDER_SVG}`;
      };
      node.appendChild(img);
      break;
    }
  }

  return node;
};

export const renderSlide = (slide: Slide, theme: Theme): HTMLElement => {
  const stage = document.createElement("div");
  stage.className = "wm-slide";
  stage.dataset.slideId = slide.id;
  stage.style.width = `${SLIDE_W}px`;
  stage.style.height = `${SLIDE_H}px`;
  stage.style.background =
    resolveColor(slide.background, theme) ?? theme.colors.background;
  stage.style.fontFamily = theme.fonts.body;

  for (const element of [...slide.elements].sort((a, b) => a.z - b.z)) {
    stage.appendChild(renderElement(element, theme));
  }
  return stage;
};
