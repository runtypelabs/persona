import type { AgentWidgetArtifactsFeature } from "../types";
import { appendCharSpans } from "./tool-loading-animation";

/**
 * Apply the artifact "Generating …" streaming animation to a status element.
 *
 * Shared by the artifact reference card and the inline chrome so both surfaces
 * honor `features.artifacts.loadingAnimation` (and the color / duration knobs)
 * identically. Character-by-character modes (`shimmer`, `shimmer-color`,
 * `rainbow`) wrap each character in a `persona-tool-char` span; `pulse` fades
 * the whole element; `none` renders plain text.
 *
 * The caller owns the element and its reset — pass a fresh (or cleared) span so
 * stale animation classes from a previous streaming render do not linger.
 */
export function applyArtifactLoadingStatus(
  statusText: HTMLElement,
  text: string,
  artifactsCfg: AgentWidgetArtifactsFeature | undefined
): void {
  const loadingAnimation = artifactsCfg?.loadingAnimation ?? "shimmer";
  const duration = artifactsCfg?.loadingAnimationDuration ?? 2000;

  if (loadingAnimation === "none") {
    statusText.textContent = text;
    return;
  }

  if (loadingAnimation === "pulse") {
    statusText.setAttribute("data-preserve-animation", "true");
    statusText.classList.add("persona-tool-loading-pulse");
    statusText.style.setProperty("--persona-tool-anim-duration", `${duration}ms`);
    statusText.textContent = text;
    return;
  }

  statusText.setAttribute("data-preserve-animation", "true");
  statusText.classList.add(`persona-tool-loading-${loadingAnimation}`);
  statusText.style.setProperty("--persona-tool-anim-duration", `${duration}ms`);
  if (loadingAnimation === "shimmer-color") {
    if (artifactsCfg?.loadingAnimationColor) {
      statusText.style.setProperty(
        "--persona-tool-anim-color",
        artifactsCfg.loadingAnimationColor
      );
    }
    if (artifactsCfg?.loadingAnimationSecondaryColor) {
      statusText.style.setProperty(
        "--persona-tool-anim-secondary-color",
        artifactsCfg.loadingAnimationSecondaryColor
      );
    }
  }
  appendCharSpans(statusText, text, 0);
}
