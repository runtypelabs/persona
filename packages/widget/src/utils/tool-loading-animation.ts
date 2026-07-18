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
