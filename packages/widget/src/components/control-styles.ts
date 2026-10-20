import type { AgentWidgetConfig } from "../types";
import { getExplicitLegacyStyle } from "../utils/style-provenance";

/** CSS transport for a narrowly scoped control, retaining legacy normalization. */
export const controlToken = (
  config: AgentWidgetConfig | undefined,
  group: "header.close" | "header.clear" | "composer.send" | "voice.control",
  leaf: string,
  fallback: string,
): string => {
  const [parent, child] = group.split(".");
  // Optional leaves have no built-in defaults. Check both layers so a mounted
  // control follows scheme changes through CSS without a DOM rebuild.
  const present = [config?.theme, config?.darkTheme].some((theme) => {
    const components = theme?.components as Record<string, unknown> | undefined;
    const children = components?.[parent] as Record<string, unknown> | undefined;
    const tokens = children?.[child] as Record<string, unknown> | undefined;
    return tokens?.[leaf] !== undefined;
  });
  return present
    ? `var(--persona-components-${group.replace(".", "-")}-${leaf}, ${fallback})`
    : fallback;
};

export const legacyControlValue = (
  config: AgentWidgetConfig | undefined,
  path: string,
): string | undefined => {
  const value = config && getExplicitLegacyStyle(config, path);
  return typeof value === "string" && value ? value : undefined;
};

/** Shorthand first, then independent legacy axes. Never retain a stale axis. */
export const applyControlPadding = (
  button: HTMLButtonElement,
  padding: string,
  x?: string,
  y?: string,
): void => {
  // Keep a variable shorthand in CSS: setting an inline axis must not erase
  // its sibling's theme value through CSSOM shorthand serialization.
  const themed = padding.startsWith("var(");
  button.classList.toggle("persona-theme-padding", themed);
  button.style.padding = themed ? "" : padding;
  if (themed) button.style.setProperty("--persona-theme-padding", padding);
  else button.style.removeProperty("--persona-theme-padding");
  if (x) button.style.paddingLeft = button.style.paddingRight = x;
  if (y) button.style.paddingTop = button.style.paddingBottom = y;
};

/** Theme sizes respect coarse-pointer CSS floors; legacy sizes retain authority. */
export const applyControlSize = (
  button: HTMLButtonElement,
  size: string,
  explicitSize?: string,
): void => {
  const themed = size.startsWith("var(") && size.includes("--persona-components-");
  button.classList.toggle("persona-control-size", themed);
  if (themed) button.style.setProperty("--persona-control-size", size);
  else button.style.removeProperty("--persona-control-size");
  button.style.width = button.style.height = size;
  button.style.minWidth = button.style.minHeight = explicitSize ?? "";
};
