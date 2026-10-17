// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { AgentWidgetConfig } from "../types";
import { mergeWithDefaults } from "../defaults";
import { mergeConfigUpdate } from "./config-merge";
import { applyThemeVariables, getActiveTheme, getCssVariables } from "./theme";
import { OPT_IN_THEME_STYLE_PATHS } from "./style-provenance";

const resolved = (config: Partial<AgentWidgetConfig>) => mergeWithDefaults(config) as AgentWidgetConfig;
const atPath = (path: string, value: unknown): Record<string, unknown> =>
  path.split(".").reverse().reduce<Record<string, unknown>>((child, key, index) =>
    ({ [key]: index === 0 ? value : child }), {});

describe("previously unused token consumer intent", () => {
  it.each([false, true])("keeps every unconfigured consumer absent without removing public token emission (v5=%s)", (v5Defaults) => {
    for (const colorScheme of ["light", "dark"] as const) {
      const css = getCssVariables(getActiveTheme(resolved({ future: { v5Defaults }, colorScheme })));
      for (const path of OPT_IN_THEME_STYLE_PATHS) {
        const suffix = path.split(".").join("-");
        expect(css[`--persona-consumer-${suffix}`]).toBeUndefined();
        expect(css[`--persona-components-${suffix}`]).toBeDefined();
      }
    }
  });

  it.each(OPT_IN_THEME_STYLE_PATHS)("resolves host references and dark overrides for %s", (path) => {
    let config = resolved({ theme: atPath(`components.${path}`, "semantic.colors.primary") });
    const suffix = path.split(".").join("-");
    let css = getCssVariables(getActiveTheme(config));
    expect(css[`--persona-consumer-${suffix}`]).toBe(css["--persona-primary"]);
    config = mergeConfigUpdate(config, { colorScheme: "dark", darkTheme: atPath(`components.${path}`, "#123456") });
    css = getCssVariables(getActiveTheme(config));
    expect(css[`--persona-consumer-${suffix}`]).toBe("#123456");
    config = mergeConfigUpdate(config, { darkTheme: atPath(`components.${path}`, undefined) });
    css = getCssVariables(getActiveTheme(config));
    expect(css[`--persona-consumer-${suffix}`]).toBe(css["--persona-primary"]);
    config = mergeConfigUpdate(config, { theme: atPath(`components.${path}`, undefined) });
    expect(getCssVariables(getActiveTheme(config))[`--persona-consumer-${suffix}`]).toBeUndefined();
  });

  it("removes stale consumer aliases on reset and color-scheme switches", () => {
    const element = document.createElement("div");
    let config = resolved({ darkTheme: { components: { voice: { processing: { icon: "pink" } } } }, colorScheme: "dark" });
    applyThemeVariables(element, config);
    expect(element.style.getPropertyValue("--persona-consumer-voice-processing-icon")).toBe("pink");
    config = mergeConfigUpdate(config, { colorScheme: "light" });
    applyThemeVariables(element, config);
    expect(element.style.getPropertyValue("--persona-consumer-voice-processing-icon")).toBe("");
    config = mergeConfigUpdate(config, { colorScheme: "dark" });
    applyThemeVariables(element, config);
    expect(element.style.getPropertyValue("--persona-consumer-voice-processing-icon")).toBe("pink");
    config = mergeConfigUpdate(config, { darkTheme: undefined });
    applyThemeVariables(element, config);
    expect(element.style.getPropertyValue("--persona-consumer-voice-processing-icon")).toBe("");
    expect(element.style.getPropertyValue("--persona-components-voice-processing-icon")).not.toBe("");
  });
});
