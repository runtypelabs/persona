import { cx } from "./dom";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Reusable icon spinner: a small SVG ring with a faint full track plus a
 * rotating arc.
 *
 * Icon-first loading is the norm for preview surfaces (Sandpack, YouTube/Figma/
 * CodePen embeds, ChatGPT/Claude/v0) and every major design system (Apple HIG,
 * Material, Carbon, Polaris, Geist); text-only "Loading…" is used by none, and
 * HIG explicitly warns against the vague word "loading". So the default preview
 * indicator is this spinner, with any work-naming label added only later as an
 * escalation. The arc spins via a GPU-friendly `transform: rotate` keyframe
 * (see `.persona-spinner` in widget.css); under `prefers-reduced-motion` the
 * rotation stops and the static arc still reads as a progress ring.
 *
 * Structure and animation live in CSS (class `persona-spinner`); geometry here
 * is viewBox-relative so the rendered size follows `--persona-artifact-spinner-size`.
 */
export function createSpinner(className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cx("persona-spinner", className));
  svg.setAttribute("viewBox", "0 0 24 24");
  // Decorative: the loading state is announced by surrounding copy/labels, so
  // the spinner itself must not add redundant noise to the accessibility tree.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const track = document.createElementNS(SVG_NS, "circle");
  track.setAttribute("class", "persona-spinner-track");
  track.setAttribute("cx", "12");
  track.setAttribute("cy", "12");
  track.setAttribute("r", "9");

  const arc = document.createElementNS(SVG_NS, "circle");
  arc.setAttribute("class", "persona-spinner-arc");
  arc.setAttribute("cx", "12");
  arc.setAttribute("cy", "12");
  arc.setAttribute("r", "9");

  svg.appendChild(track);
  svg.appendChild(arc);
  return svg;
}
