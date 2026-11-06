import type { AgentWidgetStatusIndicatorConfig } from "../types";

/** Transient connection chrome excludes normal idle and streaming states. */
export const isStatusIndicatorVisible = (
  config: AgentWidgetStatusIndicatorConfig,
  status: string,
): boolean => config.visible !== false && (
  config.mode !== "transient" ||
  status === "connecting" || status === "paused" ||
  status === "resuming" || status === "error"
);

export const applyStatusIndicatorState = (
  element: HTMLElement,
  config: AgentWidgetStatusIndicatorConfig,
  status: string,
): void => {
  const transient = config.mode === "transient";
  const align = config.align ?? (transient ? "left" : "right");
  for (const side of ["left", "center", "right"]) {
    element.classList.toggle(`persona-text-${side}`, side === align);
  }
  const hasNotice = element.hasAttribute("data-persona-composer-reason") ||
    element.hasAttribute("data-persona-composer-notice");
  element.style.display = isStatusIndicatorVisible(config, status) ||
    (transient && hasNotice && config.visible !== false) ? "" : "none";
  element.classList.toggle("persona-mt-2", !transient);
  element.classList.toggle("persona-mb-2", transient);
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
