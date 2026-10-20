import type { AgentWidgetApprovalConfig, AgentWidgetConfig } from "../types";
import { getExplicitLegacyStyle, hasExplicitThemeStyle } from "./style-provenance";

type ApprovalStyles = AgentWidgetApprovalConfig & { denyBorderColor: string; pendingIconColor: string };
const variable = (path: string, fallback: string): string => `var(--persona-components-approval-${path.split(".").join("-")}, ${fallback})`;
const consumer = (path: string, fallback: string): string => `var(--persona-consumer-approval-${path.split(".").join("-")}, ${fallback})`;

/** Shared appearance projection; builders retain their own copy and decision contracts. */
export function resolveApprovalStyles(config: AgentWidgetConfig | undefined, builder: "plugin" | "public"): ApprovalStyles {
  const legacy = (key: keyof AgentWidgetApprovalConfig): string | undefined => {
    const value = getExplicitLegacyStyle(config, `approval.${key}`);
    return typeof value === "string" ? value : undefined;
  };
  const color = (key: keyof AgentWidgetApprovalConfig, path: string, fallback: string): string =>
    legacy(key) || variable(path, consumer("requested.text", fallback));
  const background = (key: keyof AgentWidgetApprovalConfig, path: string): string | undefined =>
    legacy(key) ?? (hasExplicitThemeStyle(config, `approval.${path}`) ? `var(--persona-components-approval-${path.split(".").join("-")})` : undefined);
  const publicBuilder = builder === "public";
  const muted = publicBuilder ? "var(--persona-muted, #6b7280)" : "var(--persona-muted, #6b7280)";
  const titleFallback = publicBuilder ? "var(--persona-primary, #171717)" : "var(--persona-text, #0b0b0b)";
  const denyFallback = publicBuilder ? "var(--persona-feedback-error, var(--persona-palette-colors-error-600))" : "var(--persona-text, #1f2937)";
  const shadow = legacy("shadow");
  return {
    backgroundColor: background("backgroundColor", "requested.background"),
    borderColor: background("borderColor", "requested.border"),
    shadow: shadow !== undefined ? (shadow.trim() === "" ? "none" : shadow) : background("shadow", "requested.shadow"),
    titleColor: color("titleColor", "requested.titleColor", titleFallback),
    descriptionColor: color("descriptionColor", "requested.descriptionColor", muted),
    reasonColor: legacy("reasonColor") || legacy("descriptionColor") || variable("requested.reasonColor", consumer("requested.text", muted)),
    parameterBackgroundColor: legacy("parameterBackgroundColor") || variable("requested.parameters.background", publicBuilder ? "var(--persona-container, #f8fafc)" : "var(--persona-container, rgba(11, 11, 11, 0.04))"),
    parameterTextColor: color("parameterTextColor", "requested.parameters.foreground", publicBuilder ? "var(--persona-primary, #171717)" : "var(--persona-text, #1f2937)"),
    approveButtonColor: background("approveButtonColor", "approve.background"),
    approveButtonTextColor: legacy("approveButtonTextColor") || consumer("approve.foreground", "var(--persona-button-primary-fg)"),
    denyButtonColor: legacy("denyButtonColor") ?? (publicBuilder ? consumer("deny.background", "transparent") : undefined),
    denyButtonTextColor: legacy("denyButtonTextColor") || consumer("deny.foreground", denyFallback),
    denyBorderColor: legacy("denyButtonTextColor") || consumer("deny.foreground", "var(--persona-palette-colors-error-200)"),
    pendingIconColor: legacy("titleColor") || variable("requested.titleColor", consumer("requested.text", "currentColor")),
  };
}
