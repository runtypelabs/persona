import type { AgentWidgetArtifactsFeature } from "../types";
import { applyLoadingAnimation } from "./loading-label-deps";

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
  statusText.textContent = text;
  applyLoadingAnimation(statusText, {
    animation: artifactsCfg?.loadingAnimation ?? "shimmer",
    duration: `${artifactsCfg?.loadingAnimationDuration ?? 2000}ms`,
    color: artifactsCfg?.loadingAnimationColor,
    secondaryColor: artifactsCfg?.loadingAnimationSecondaryColor,
  });
}
