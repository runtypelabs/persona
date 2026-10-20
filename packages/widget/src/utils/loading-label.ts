import type { AgentWidgetConfig, LoadingLabelAnimationContext } from "../types";
import { applyLoadingAnimation } from "./tool-loading-animation";
import { resolveToolStyles, toolLoadingDuration } from "./tool-styles";

type Kind = LoadingLabelAnimationContext["kind"];

/** Fresh default-owned render trees only declare effects. Custom hooks start after commit. */
export function applyLoadingLabel(element: HTMLElement, config: AgentWidgetConfig | undefined, kind: Kind): void {
  const shared = config?.loadingLabel;
  const reasoning = kind === "reasoning";
  const styles = reasoning ? config?.reasoning : resolveToolStyles(config);
  const display = kind === "waiting" ? undefined : reasoning ? config?.features?.reasoningDisplay : config?.features?.toolCallDisplay;
  const animation = shared?.animation ?? display?.loadingAnimation ??
    (kind === "waiting" || config?.future?.v5Defaults ? "shimmer" : "none");
  if (animation === "none") return;
  const options = {
    animation,
    duration: shared?.duration !== undefined ? `${shared.duration}ms`
      : reasoning ? `${styles?.loadingAnimationDuration ?? 2000}ms` : toolLoadingDuration(config),
    color: shared?.color ?? styles?.loadingAnimationColor,
    secondaryColor: shared?.secondaryColor ?? styles?.loadingAnimationSecondaryColor,
  };
  element.dataset.personaLoadingLabel = kind;
  element.dataset.personaLoadingText = element.textContent ?? "";
  element.dataset.personaLoadingAnimation = JSON.stringify([kind, element.textContent, options, !!shared?.animate, element.className, element.getAttribute("style")]);
  if (shared?.animate) element.setAttribute("data-preserve-animation", "true");
  else applyLoadingAnimation(element, options);
}
