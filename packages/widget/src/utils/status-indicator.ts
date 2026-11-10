import type { AgentWidgetStatusIndicatorConfig } from "../types";
import type { ConnectionRecoveryState } from "../session";

/** Transient connection chrome excludes normal idle and streaming states. */
export const isStatusIndicatorVisible = (
  config: AgentWidgetStatusIndicatorConfig,
  status: string,
  recovery: ConnectionRecoveryState = "none",
): boolean => config.visible !== false && (
  config.mode !== "transient" ||
  recovery !== "none" || status === "paused" ||
  status === "resuming" || status === "error"
);

export const applyStatusIndicatorState = (
  element: HTMLElement,
  config: AgentWidgetStatusIndicatorConfig,
  status: string,
  recovery: ConnectionRecoveryState = "none",
): void => {
  const transient = config.mode === "transient";
  const align = config.align ?? (transient ? "left" : "right");
  for (const side of ["left", "center", "right"]) {
    element.classList.toggle(`persona-text-${side}`, side === align);
  }
  const hasNotice = element.hasAttribute("data-persona-composer-reason") ||
    element.hasAttribute("data-persona-composer-notice");
  element.style.display = isStatusIndicatorVisible(config, status, recovery) ||
    (transient && hasNotice && config.visible !== false) ? "" : "none";
  element.classList.toggle("persona-mt-2", !transient);
  element.classList.toggle("persona-mb-2", transient);
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
};

/** Move only sibling regions, leaving a plugin's internal structure intact. */
export const placeStatusIndicator = (
  element: HTMLElement,
  form: HTMLElement,
  config: AgentWidgetStatusIndicatorConfig,
): void => {
  if (!form.parentElement || element.parentElement !== form.parentElement) return;
  if (config.mode === "transient") {
    if (element.nextElementSibling !== form) form.before(element);
  } else if (form.nextElementSibling !== element) {
    form.after(element);
  }
};
