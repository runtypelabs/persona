import { createElement } from "./dom";

/**
 * Append text as individual animated character spans.
 * Each character becomes a `persona-tool-char` span carrying a `--char-index`
 * custom property so the shimmer/rainbow keyframes can stagger their delay.
 * Spaces are rendered as non-breaking spaces so they animate like any other
 * character. Returns the next available character index.
 */
export const appendCharSpans = (
  container: HTMLElement,
  text: string,
  startIndex: number
): number => {
  let idx = startIndex;
  for (const char of text) {
    const span = createElement("span", "persona-tool-char");
    span.style.setProperty("--char-index", String(idx));
    span.textContent = char === " " ? "\u00A0" : char;
    container.appendChild(span);
    idx++;
  }
  return idx;
};

export type LoadingAnimationOptions = {
  animation: import("../types").AgentWidgetToolCallLoadingAnimation;
  duration?: string;
  color?: string;
  secondaryColor?: string;
};

/** Shared builtin renderer; preserves formatting and independently updated timers. */
export function applyLoadingAnimation(element: HTMLElement, options: LoadingAnimationOptions): void {
  const { animation, duration, color, secondaryColor } = options;
  if (animation === "none") return;
  element.setAttribute("data-preserve-animation", "true");
  element.classList.add(`persona-tool-loading-${animation}`);
  if (duration) element.style.setProperty("--persona-tool-anim-duration", duration);
  if (color) element.style.setProperty("--persona-tool-anim-color", color);
  if (secondaryColor) element.style.setProperty("--persona-tool-anim-secondary-color", secondaryColor);
  if (animation === "pulse") return;
  let index = 0;
  const wrap = (parent: HTMLElement) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) {
        const fragment = document.createElement("span");
        index = appendCharSpans(fragment, node.textContent ?? "", index);
        node.replaceWith(...Array.from(fragment.childNodes));
      } else if (node instanceof HTMLElement && !node.hasAttribute("data-tool-elapsed")) wrap(node);
    }
  };
  wrap(element);
}
