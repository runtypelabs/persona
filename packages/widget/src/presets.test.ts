import { describe, expect, it, vi } from "vitest";
import { PRESET_SHOP, PRESETS, getPreset } from "./presets";
import { resolveWelcomeConfig } from "./welcome";
import { createLegacyDiagnosticContext } from "./utils/legacy-diagnostics";

describe("modern widget preset paths", () => {
  it("retains shopping welcome text and legacy composer chip placement without authored aliases", () => {
    const config = PRESET_SHOP.config;
    expect(resolveWelcomeConfig(config).title).toBe("Welcome to our shop!");
    expect(resolveWelcomeConfig(config).subtitle).toBe("I can help you find products and answer questions");
    expect(config.copy?.welcomeTitle).toBeUndefined();
    expect(config.suggestionChips).toBeUndefined();
    expect(config.suggestions?.starters).toMatchObject({ variant: "chip", placement: "composer", overflow: "wrap", maxItems: 4 });
    expect(config.suggestions?.starters?.items).toHaveLength(3);
    expect(getPreset("shop")).toBe(PRESET_SHOP);
  });

  it("does not produce migration hints from built-in presets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const preset of Object.values(PRESETS)) createLegacyDiagnosticContext({ ...preset.config, debug: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
