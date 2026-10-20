import { describe, expect, it } from "vitest";
import type { AgentWidgetConfig } from "../types";
import { mergeWithDefaults, resolveDefaults } from "../defaults";
import { mergeConfigUpdate } from "./config-merge";
import {
  getExplicitLegacyStyle, hasExplicitStylePath, hasExplicitThemeStyle,
  LEGACY_STYLE_PATHS,
} from "./style-provenance";

const resolved = (config: Partial<AgentWidgetConfig> = {}) =>
  mergeWithDefaults(config) as AgentWidgetConfig;

const atPath = (path: string, value: unknown): Record<string, unknown> =>
  path.split(".").reverse().reduce<Record<string, unknown>>((child, key, index) =>
    ({ [key]: index === 0 ? value : child }), {});

describe("bounded legacy style origin", () => {
  it.each([false, true])("keeps inherited public values without treating them as host input (v5=%s)", (v5Defaults) => {
    const config = resolved({ future: { v5Defaults } });
    expect(config.suggestionChipsConfig?.paddingX).toBe("12px");
    expect(config.launcher?.closeButtonBackgroundColor).toBe("transparent");
    expect(getExplicitLegacyStyle(config, "suggestionChipsConfig.paddingX")).toBeUndefined();
    expect(getExplicitLegacyStyle(config, "launcher.closeButtonBackgroundColor")).toBeUndefined();
    expect(getExplicitLegacyStyle(config, "voiceRecognition.recordingBorderColor")).toBeUndefined();
  });

  it.each(LEGACY_STYLE_PATHS)("tracks explicit input and resets for %s", (path) => {
    let config = resolved(atPath(path, "transparent") as Partial<AgentWidgetConfig>);
    expect(getExplicitLegacyStyle(config, path)).toBe("transparent");
    config = mergeConfigUpdate(config, { copy: { inputPlaceholder: "Updated" } });
    expect(getExplicitLegacyStyle(config, path)).toBe("transparent");
    config = mergeConfigUpdate(config, atPath(path, undefined));
    expect(getExplicitLegacyStyle(config, path)).toBeUndefined();
    expect(hasExplicitStylePath(config, path)).toBe(false);
  });

  it.each(["", 0, false, "none", "transparent"])("records %s independently of renderer normalization", (value) => {
    expect(getExplicitLegacyStyle(atPath("sendButton.textColor", value), "sendButton.textColor")).toBe(value);
  });

  it("clears every descendant of a cleared or disabled parent", () => {
    let config = resolved({
      launcher: { clearChat: { paddingX: "0", iconColor: "red" } },
      approval: { titleColor: "red", approveButtonTextColor: "green" },
      features: { askUserQuestion: { styles: { pillBackground: "pink" } } },
    });
    config = mergeConfigUpdate(config, {
      launcher: { clearChat: undefined }, approval: false,
      features: { askUserQuestion: undefined },
    });
    for (const path of ["launcher.clearChat.paddingX", "launcher.clearChat.iconColor", "approval.titleColor", "approval.approveButtonTextColor", "features.askUserQuestion.styles.pillBackground"]) {
      expect(hasExplicitStylePath(config, path)).toBe(false);
    }
    config = mergeConfigUpdate(config, { approval: { title: "New" } });
    expect(hasExplicitStylePath(config, "approval.titleColor")).toBe(false);
  });

  it("preserves origin through supported copies and notices edits to those copies", () => {
    const config = resolved({ sendButton: { textColor: "red" } });
    const copy = { ...config, sendButton: { ...config.sendButton } };
    expect(getExplicitLegacyStyle(mergeWithDefaults(copy), "voiceRecognition.backgroundColor")).toBeUndefined();
    expect(getExplicitLegacyStyle(copy, "sendButton.textColor")).toBe("red");
    const changed = { ...copy, voiceRecognition: { ...copy.voiceRecognition, backgroundColor: "pink" } };
    expect(getExplicitLegacyStyle(mergeWithDefaults(changed), "voiceRecognition.backgroundColor")).toBe("pink");
    const cleared = { ...changed, sendButton: { ...changed.sendButton, textColor: undefined } };
    expect(getExplicitLegacyStyle(mergeConfigUpdate(config, cleared), "sendButton.textColor")).toBeUndefined();
    expect(getExplicitLegacyStyle(config, "sendButton.textColor")).toBe("red");
  });

  it("treats unknown-origin externally filled and JSON-round-tripped values as explicit", () => {
    const external = { ...resolveDefaults(), theme: { components: { suggestion: { chip: { padding: "20px" } } } } };
    expect(getExplicitLegacyStyle(mergeWithDefaults(external), "suggestionChipsConfig.paddingX")).toBe("12px");
    const json = JSON.parse(JSON.stringify(resolved())) as AgentWidgetConfig;
    expect(getExplicitLegacyStyle(mergeWithDefaults(json), "voiceRecognition.backgroundColor")).toBe("transparent");
    const reset = mergeConfigUpdate(json, { voiceRecognition: { backgroundColor: undefined } });
    expect(getExplicitLegacyStyle(reset, "voiceRecognition.backgroundColor")).toBeUndefined();
  });

  it("retains explicitly chosen default values across V4/V5 switches", () => {
    let config = resolved({ suggestionChipsConfig: { fontWeight: "500" } });
    config = mergeConfigUpdate(config, { future: { v5Defaults: true } });
    expect(getExplicitLegacyStyle(config, "suggestionChipsConfig.fontWeight")).toBe("500");
    config = mergeConfigUpdate(config, { suggestionChipsConfig: { fontWeight: undefined } });
    config = mergeConfigUpdate(config, { future: { v5Defaults: false } });
    expect(config.suggestionChipsConfig?.fontWeight).toBe("500");
    expect(getExplicitLegacyStyle(config, "suggestionChipsConfig.fontWeight")).toBeUndefined();
  });

  it("records inactive dark input and removes bounded theme intent on reset", () => {
    let config = resolved({ darkTheme: { components: { voice: { processing: { icon: "pink" } } } } });
    expect(hasExplicitThemeStyle(config, "voice.processing.icon", "light")).toBe(false);
    expect(hasExplicitThemeStyle(config, "voice.processing.icon", "dark")).toBe(true);
    config = mergeConfigUpdate(config, { darkTheme: { components: { voice: undefined } } });
    expect(hasExplicitThemeStyle(config, "voice.processing.icon", "dark")).toBe(false);
  });
});
