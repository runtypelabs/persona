// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { AgentWidgetConfig } from "../types";
import type { AgentWidgetSession } from "../session";
import { mergeWithDefaults, resolveDefaults } from "../defaults";
import { mergeConfigUpdate } from "../utils/config-merge";
import { applyThemeVariables } from "../utils/theme";
import { createSuggestions } from "./suggestions";

afterEach(() => { document.body.replaceChildren(); document.documentElement.classList.remove("dark"); });

const resolved = (config: Partial<AgentWidgetConfig>) => mergeWithDefaults(config) as AgentWidgetConfig;
const render = (config: AgentWidgetConfig, variant: "chip" | "card" | "list" = "chip") => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  applyThemeVariables(container, config);
  const manager = createSuggestions(container);
  const session = { isStreaming: () => false, getMessages: () => [] } as unknown as AgentWidgetSession;
  manager.render(["One"], session, document.createElement("textarea"), [], config.suggestionChipsConfig, { config, variant });
  manager.destroy();
  return { container, button: container.querySelector("button")! };
};

describe.each([false, true])("suggestion style migration (v5=%s)", (v5Defaults) => {
  const theme = { components: { suggestion: { chip: { padding: "10px 20px", fontWeight: "700" } } } };
  it("retains the default chip appearance when no theme opinion is supplied", () => {
    const { button } = render(resolved({ future: { v5Defaults } }));
    expect(button.style.paddingLeft).toBe("12px");
    expect(button.style.paddingTop).toBe("6px");
    expect(button.style.fontWeight).toBe(v5Defaults ? "" : "500");
  });

  it("lets explicit chip theme tokens override materialized legacy defaults", () => {
    const config = resolved({ future: { v5Defaults }, theme });
    const { container, button } = render(config);
    expect(config.suggestionChipsConfig?.paddingX).toBe("12px");
    expect(container.style.getPropertyValue("--persona-components-suggestion-chip-padding")).toBe("10px 20px");
    expect(container.style.getPropertyValue("--persona-components-suggestion-chip-fontWeight")).toBe("700");
    expect(button.style.padding).toBe("");
    expect(button.style.fontWeight).toBe(v5Defaults ? "" : "var(--persona-suggestion-compat-weight, 500)");
  });

  it("retains independent explicit axes and releases them on reset", () => {
    let config = resolved({ future: { v5Defaults }, theme, suggestionChipsConfig: { paddingX: "3px", fontWeight: "500" } });
    let button = render(config).button;
    expect(button.style.paddingLeft).toBe("3px");
    expect(button.style.paddingTop).toBe("");
    expect(button.style.fontWeight).toBe("500");
    config = mergeConfigUpdate(config, { copy: { inputPlaceholder: "Unrelated" } });
    config = mergeConfigUpdate(config, { suggestionChipsConfig: { paddingX: undefined } });
    button = render(config).button;
    expect(button.style.paddingLeft).toBe("");
    expect(button.style.fontWeight).toBe("500");
    config = mergeConfigUpdate(config, { suggestionChipsConfig: undefined });
    button = render(config).button;
    expect(button.style.padding).toBe("");
    expect(button.style.fontWeight).toBe(v5Defaults ? "" : "var(--persona-suggestion-compat-weight, 500)");
    config = mergeConfigUpdate(config, { future: { v5Defaults: !v5Defaults } });
    expect(render(config).button.style.padding).toBe("");
  });

  it("uses the active dark theme and releases inheritance when themes clear", () => {
    let config = resolved({ future: { v5Defaults }, colorScheme: "dark", darkTheme: theme });
    expect(render(config).button.style.padding).toBe("");
    config = mergeConfigUpdate(config, { colorScheme: "light" });
    expect(render(config).container.style.getPropertyValue("--persona-suggestion-compat-padding")).toBe("6px 12px");
    config = mergeConfigUpdate(config, { theme });
    expect(render(config).button.style.fontWeight).toBe(v5Defaults ? "" : "var(--persona-suggestion-compat-weight, 500)");
    config = mergeConfigUpdate(config, { theme: undefined, darkTheme: undefined });
    expect(render(config).button.style.fontWeight).toBe(v5Defaults ? "" : "500");
  });

  it.each(["card", "list"] as const)("keeps chip styles out of %s variants", (variant) => {
    const { button } = render(resolved({ future: { v5Defaults }, theme, suggestionChipsConfig: { paddingX: "3px", fontWeight: "800" } }), variant);
    expect(button.style.padding).toBe("");
    expect(button.style.fontWeight).toBe("");
  });

  it("conservatively preserves externally materialized aliases until the host resets them", () => {
    const external = { ...resolveDefaults({ future: { v5Defaults } }), future: { v5Defaults }, theme };
    const config = resolved(external);
    expect(render(config).button.style.paddingLeft).toBe("12px");
    const reset = mergeConfigUpdate(config, { suggestionChipsConfig: undefined });
    expect(render(reset).button.style.paddingLeft).toBe("");
  });

  it("does not activate the accepted legacy fontFamily no-op", () => {
    const config = resolved({ future: { v5Defaults }, suggestionChipsConfig: { fontFamily: "mono" } });
    expect(render(config).button.style.fontFamily).toBe("");
  });

  it("follows light/dark observer transport without rebuilding chips or retaining inherited axes", () => {
    const config = resolved({ future: { v5Defaults }, colorScheme: "auto", darkTheme: theme });
    const { container, button } = render(config);
    expect(button.style.padding).toBe("");
    expect(button.classList.contains("persona-theme-padding")).toBe(true);
    expect(container.style.getPropertyValue("--persona-suggestion-compat-padding")).toBe("6px 12px");
    expect(container.style.getPropertyValue("--persona-suggestion-compat-weight")).toBe("500");
    document.documentElement.classList.add("dark");
    applyThemeVariables(container, config);
    expect(container.querySelector("button")).toBe(button);
    expect(container.style.getPropertyValue("--persona-suggestion-compat-padding")).toBe("10px 20px");
    expect(container.style.getPropertyValue("--persona-suggestion-compat-weight")).toBe("700");
    document.documentElement.classList.remove("dark");
    applyThemeVariables(container, config);
    expect(container.style.getPropertyValue("--persona-suggestion-compat-padding")).toBe("6px 12px");
  });
});
