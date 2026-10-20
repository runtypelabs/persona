import type { AgentWidgetConfig } from "../types";
import type { ActivityDependencies } from "../activity-dependencies";

const mappings = {
  backgroundColor: "background", borderColor: "borderColor", borderWidth: "borderWidth", borderRadius: "borderRadius",
  headerBackgroundColor: "header.background", headerTextColor: "header.foreground",
  contentBackgroundColor: "content.background", contentTextColor: "content.foreground",
  codeBlockBackgroundColor: "codeBlock.background", codeBlockBorderColor: "codeBlock.borderColor", codeBlockTextColor: "codeBlock.foreground",
  toggleTextColor: "toggleForeground", labelTextColor: "labelForeground",
  loadingAnimationColor: "loading.primary", loadingAnimationSecondaryColor: "loading.secondary",
} as const;

/** Bind optional renderers to the core provenance functions at adoption. */
export function createToolStyleResolvers({ getExplicitLegacyStyle, hasExplicitThemeStyle }: Pick<ActivityDependencies, "getExplicitLegacyStyle" | "hasExplicitThemeStyle">) {
  /** Local styling projection only: public config and plugin input stay intact. */
  function resolveToolStyles(config?: AgentWidgetConfig): NonNullable<AgentWidgetConfig["toolCall"]> {
    const result = { ...config?.toolCall };
    for (const [key, token] of Object.entries(mappings) as [keyof typeof mappings, string][]) {
      if (getExplicitLegacyStyle(config, `toolCall.${key}`) === undefined && hasExplicitThemeStyle(config, `toolBubble.${token}`)) {
        result[key] = `var(--persona-components-toolBubble-${token.split(".").join("-")})`;
      }
    }
    return result;
  }

  function applyToolPadding(element: HTMLElement, config: AgentWidgetConfig | undefined, section: "header" | "content"): void {
    element.classList.remove("persona-theme-padding");
    element.style.removeProperty("--persona-theme-padding");
    for (const side of ["padding-left", "padding-right", "padding-top", "padding-bottom"]) element.style.removeProperty(side);
    if (hasExplicitThemeStyle(config, `toolBubble.${section}.padding`)) {
      element.classList.add("persona-theme-padding");
      element.style.setProperty("--persona-theme-padding", `var(--persona-components-toolBubble-${section}-padding)`);
    }
    const x = getExplicitLegacyStyle(config, `toolCall.${section}PaddingX`);
    const y = getExplicitLegacyStyle(config, `toolCall.${section}PaddingY`);
    if (typeof x === "string" && x) { element.style.paddingLeft = x; element.style.paddingRight = x; }
    if (typeof y === "string" && y) { element.style.paddingTop = y; element.style.paddingBottom = y; }
  }

  function toolLoadingDuration(config?: AgentWidgetConfig): string {
    const legacy = config?.toolCall?.loadingAnimationDuration;
    return legacy !== undefined ? `${legacy}ms`
      : hasExplicitThemeStyle(config, "toolBubble.loading.duration")
        ? "var(--persona-components-toolBubble-loading-duration)" : "2000ms";
  }

  return { resolveToolStyles, applyToolPadding, toolLoadingDuration };
}
