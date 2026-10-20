// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { applyThemeVariables } from "../utils/theme";
import { mergeConfigUpdate } from "../utils/config-merge";
import { mergeWithDefaults } from "../defaults";
import { createToolBubble } from "./tool-bubble";

const message: AgentWidgetMessage = {
  id: "tool", role: "assistant", content: "", createdAt: "2026-01-01", variant: "tool",
  toolCall: { id: "call", name: "Search", status: "complete", result: "Found" },
};

describe("activity detail panel theme transport", () => {
  it("resolves color references and preserves partial component overrides without copying shared defaults", () => {
    const host = document.createElement("div");
    applyThemeVariables(host, { future: { v5Defaults: true }, theme: { components: {
      activity: { panel: { background: "semantic.colors.primary", borderColor: "#123456", borderWidth: "1px", borderRadius: "15px", padding: "16px 18px" } },
      toolBubble: { panel: { borderWidth: "0px" } },
      reasoningBubble: { panel: { borderRadius: "3px" } },
    } } });
    expect(host.style.getPropertyValue("--persona-components-activity-panel-background")).toBe(host.style.getPropertyValue("--persona-primary"));
    expect(host.style.getPropertyValue("--persona-components-toolBubble-panel-borderWidth")).toBe("0px");
    expect(host.style.getPropertyValue("--persona-components-reasoningBubble-panel-borderRadius")).toBe("3px");
    expect(host.style.getPropertyValue("--persona-components-activity-panel-padding")).toBe("16px 18px");
    expect(host.style.getPropertyValue("--persona-components-toolBubble-panel-padding")).toBe("");
    applyThemeVariables(host, { future: { v5Defaults: true }, theme: { components: { activity: { panel: { padding: "18px" } }, toolBubble: { panel: undefined } } } });
    expect(host.style.getPropertyValue("--persona-components-toolBubble-panel-borderWidth")).toBe("");
    expect(host.style.getPropertyValue("--persona-components-reasoningBubble-panel-borderRadius")).toBe("");
    expect(host.style.getPropertyValue("--persona-components-activity-panel-padding")).toBe("18px");
    applyThemeVariables(host, { future: { v5Defaults: true }, theme: undefined });
    expect(host.style.getPropertyValue("--persona-components-activity-panel-padding")).toBe("");
  });
  it("preserves sparse live patches and clears removed fields without leaking between instances", () => {
    const initial = mergeWithDefaults({ future: { v5Defaults: true }, theme: { components: {
      activity: { bodySurface: "#aabbcc", panel: { padding: "18px", borderWidth: "1px" } },
      toolBubble: { panel: { background: "red", borderWidth: "2px" } },
    } } }) as AgentWidgetConfig;
    const patched = mergeConfigUpdate(initial, { theme: { components: { toolBubble: { panel: { padding: "6px" } } } } });
    expect(patched.theme?.components?.toolBubble?.panel).toEqual({ background: "red", borderWidth: "2px", padding: "6px" });
    const cleared = mergeConfigUpdate(patched, { theme: { components: { toolBubble: { panel: { background: undefined, borderWidth: "0px", padding: undefined } } } } });
    expect(cleared.theme?.components?.toolBubble?.panel).toEqual({ borderWidth: "0px" });
    const host = document.createElement("div");
    applyThemeVariables(host, cleared);
    expect(host.style.getPropertyValue("--persona-components-activity-panel-padding")).toBe("18px");
    expect(host.style.getPropertyValue("--persona-components-toolBubble-panel-padding")).toBe("");
    expect(host.style.getPropertyValue("--persona-components-reasoningBubble-bodySurface")).toBe("#aabbcc");
    applyThemeVariables(host, mergeConfigUpdate(cleared, { theme: undefined }));
    expect(host.style.getPropertyValue("--persona-components-activity-panel-padding")).toBe("");
    expect(host.style.getPropertyValue("--persona-components-reasoningBubble-bodySurface")).toBe("");
    applyThemeVariables(host, { future: { v5Defaults: true } });
    expect(host.style.getPropertyValue("--persona-components-reasoningBubble-bodySurface")).toBe("");
  });
  it("retains codeBlock and explicit legacy styles above panel colors and border width", () => {
    const config: AgentWidgetConfig = { future: { v5Defaults: true }, theme: { components: {
      activity: { panel: { background: "red", borderColor: "red", borderWidth: "0px" } },
      toolBubble: { panel: { background: "blue" }, codeBlock: { background: "#123456", borderColor: "#abcdef" } },
    } } };
    const panel = () => createToolBubble(message, config, new Set(["tool"])).querySelector<HTMLElement>(".persona-tool-detail")!;
    expect(panel().style.backgroundColor).toBe("var(--persona-components-toolBubble-codeBlock-background)");
    expect(panel().style.borderColor).toBe("var(--persona-components-toolBubble-codeBlock-borderColor)");
    expect(panel().style.borderWidth).toBe("1px");
    config.toolCall = { codeBlockBackgroundColor: "#112233", codeBlockBorderColor: "#445566" };
    expect(panel().style.backgroundColor).toBe("rgb(17, 34, 51)");
    expect(panel().style.borderColor).toBe("rgb(68, 85, 102)");
    expect(panel().style.borderWidth).toBe("1px");
  });
});
