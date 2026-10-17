// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { mergeWithDefaults } from "../defaults";
import { mergeConfigUpdate } from "../utils/config-merge";
import { getActiveTheme, getCssVariables } from "../utils/theme";
import { resolveApprovalStyles } from "../utils/approval-styles";
import { createBuiltInApprovalPlugin } from "./approval-actions";
import { createApprovalBubble, updateApprovalBubbleUI } from "./approval-bubble";

const message: AgentWidgetMessage = {
  id: "appearance", role: "assistant", content: "", createdAt: "2026-10-13", variant: "approval",
  approval: { id: "approval", agentId: "agent", executionId: "execution", status: "pending", toolName: "read_data", description: "Read data", reason: "Needed for your request", parameters: { limit: 0 } },
};
const teardowns: Array<() => void> = [];
afterEach(() => { teardowns.splice(0).forEach((teardown) => teardown()); });
const renderPlugin = (config: AgentWidgetConfig, input = message): HTMLElement => {
  const { plugin, teardown } = createBuiltInApprovalPlugin();
  teardowns.push(teardown);
  return plugin.renderApproval!({ config, message: input, approve: vi.fn(), deny: vi.fn(), defaultRenderer: () => document.createElement("div") })!;
};
const cssValue = (value: string | undefined, variables: Record<string, string>): string | undefined => {
  if (!value) return value;
  const match = /^var\((--[\w-]+)(?:,\s*([\s\S]+))?\)$/.exec(value.trim());
  return match ? cssValue(variables[match[1]] ?? match[2], variables) : value;
};
const colors = (element: HTMLElement, config: AgentWidgetConfig, plugin: boolean): Record<string, string | undefined> => {
  const variables = getCssVariables(getActiveTheme(config));
  const color = (selector: string) => cssValue(element.querySelector<HTMLElement>(selector)?.style.color, variables);
  const background = (selector: string) => {
    const style = element.querySelector<HTMLElement>(selector)?.style;
    return cssValue(style?.backgroundColor || style?.background, variables);
  };
  return {
    title: color(plugin ? ".persona-approval-title" : "[data-approval-title]"),
    description: color(plugin ? ".persona-approval-desc" : "[data-approval-summary]"),
    reason: color(plugin ? ".persona-approval-reason" : "[data-approval-reason]"),
    parameters: color(plugin ? ".persona-approval-params" : "pre"),
    parameterBackground: background(plugin ? ".persona-approval-params" : "pre"),
    approve: color(plugin ? "[data-action='allow']" : "[data-approval-action='approve']"),
    deny: color(plugin ? "[data-action='deny']" : "[data-approval-action='deny']"),
  };
};

const appearance: AgentWidgetConfig = {
  theme: { components: { approval: {
    requested: { titleColor: "#123456", descriptionColor: "#234567", reasonColor: "#345678", parameters: { background: "#456789", foreground: "#567890" } },
    approve: { foreground: "#678901" }, deny: { foreground: "#789012" },
  } } },
};

describe("shared approval appearance migration", () => {
  it.each([false, true])("gives both builders the same explicitly themed appearance (v5=%s)", (v5Defaults) => {
    const config = mergeWithDefaults({ ...appearance, future: { v5Defaults } });
    expect(colors(renderPlugin(config), config, true)).toEqual(colors(createApprovalBubble(message, config), config, false));
    expect(colors(createApprovalBubble(message, config), config, false)).toEqual({
      title: "#123456", description: "#234567", reason: "#345678", parameters: "#567890", parameterBackground: "#456789", approve: "#678901", deny: "#789012",
    });
  });

  it("keeps explicit legacy appearance ahead of theme tokens, then restores themes after clearing", () => {
    let config = mergeWithDefaults({ ...appearance, approval: { titleColor: "red", descriptionColor: "green", approveButtonTextColor: "blue", parameterBackgroundColor: "transparent", shadow: "" } });
    const publicBubble = createApprovalBubble(message, config);
    expect(colors(publicBubble, config, false)).toMatchObject({ title: "red", description: "green", reason: "green", approve: "blue", parameterBackground: "transparent" });
    expect(publicBubble.style.boxShadow).toBe("none");
    expect(colors(renderPlugin(config), config, true)).toEqual(colors(publicBubble, config, false));
    config = mergeConfigUpdate(config, { approval: undefined });
    updateApprovalBubbleUI(message.id, publicBubble, config, message.approval);
    expect(colors(publicBubble, config, false)).toEqual(colors(renderPlugin(config), config, true));
    expect(publicBubble.style.boxShadow).toBe("var(--persona-approval-shadow)");
  });

  it.each([false, true])("preserves element defaults and distinct deny appearances without explicit new tokens (v5=%s)", (v5Defaults) => {
    const config = mergeWithDefaults({ future: { v5Defaults } });
    const variables = getCssVariables(getActiveTheme(config));
    expect(variables["--persona-consumer-approval-requested-text"]).toBeUndefined();
    expect(variables["--persona-consumer-approval-approve-foreground"]).toBeUndefined();
    expect(variables["--persona-consumer-approval-deny-foreground"]).toBeUndefined();
    const publicStyles = resolveApprovalStyles(config, "public");
    const pluginStyles = resolveApprovalStyles(config, "plugin");
    expect(cssValue(publicStyles.titleColor, variables)).toBe(variables["--persona-primary"]);
    expect(cssValue(publicStyles.descriptionColor, variables)).toBe(variables["--persona-muted"]);
    expect(cssValue(publicStyles.denyButtonColor, variables)).toBe("transparent");
    expect(cssValue(publicStyles.denyButtonTextColor, variables)).toBe(variables["--persona-feedback-error"] ?? variables["--persona-palette-colors-error-600"]);
    expect(cssValue(pluginStyles.denyButtonTextColor, variables)).toBe(variables["--persona-text"]);
    expect(pluginStyles.denyButtonColor).toBeUndefined();
  });

  it("uses explicit requested.text only behind specific text leaves and honors dark overrides", () => {
    const config = mergeWithDefaults({ theme: { components: { approval: { requested: { text: "red", titleColor: "blue" } } } }, darkTheme: { components: { approval: { requested: { text: "green" } } } }, colorScheme: "dark" });
    const rendered = createApprovalBubble(message, config);
    expect(colors(rendered, config, false)).toMatchObject({ title: "blue", description: "green", reason: "green", parameters: "green" });
    expect(colors(renderPlugin(config), config, true)).toMatchObject({ title: "blue", description: "green", reason: "green", parameters: "green" });
    const cleared = mergeConfigUpdate(config, { theme: { components: { approval: { requested: { text: undefined } } } }, darkTheme: { components: { approval: { requested: { text: undefined } } } } });
    updateApprovalBubbleUI(message.id, rendered, cleared, message.approval);
    expect(colors(rendered, cleared, false).description).toBe(getCssVariables(getActiveTheme(cleared))["--persona-muted"]);
  });

  it("themes compact resolved rows while retaining their inspectable status and params", () => {
    const config = mergeWithDefaults({ ...appearance, approval: { resolvedDisplay: "row" }, theme: { ...appearance.theme, components: { ...appearance.theme?.components, approval: { ...appearance.theme?.components?.approval, requested: { ...appearance.theme?.components?.approval?.requested, background: "pink", shadow: "none" } } } } });
    const row = renderPlugin(config, { ...message, approval: { ...message.approval!, status: "approved" } });
    expect(row.classList.contains("persona-approval-row")).toBe(true);
    expect(row.style.background).toContain("--persona-components-approval-requested-background");
    expect(row.style.boxShadow).toContain("--persona-components-approval-requested-shadow");
    expect(row.querySelector("[role=status]")?.textContent).toBe("Allowed");
    expect(row.querySelector("pre")?.textContent).toContain("limit");
  });
});
