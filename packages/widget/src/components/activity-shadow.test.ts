// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mergeWithDefaults } from "../defaults";
import { createAgentExperience, type AgentWidgetController } from "../ui";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { mergeConfigUpdate } from "../utils/config-merge";
import { applyThemeVariables } from "../utils/theme";
import { createActivityGroup } from "./activity-row";
import { createToolBubble } from "./tool-bubble";
import { createReasoningBubble } from "./reasoning-bubble";

const tool: AgentWidgetMessage = {
  id: "tool", role: "assistant", content: "", createdAt: "2026-01-01", variant: "tool",
  toolCall: { id: "tool", name: "Search", status: "complete", result: "Found" },
  turnActivity: { id: "turn", kind: "progress" },
};
const reasoning: AgentWidgetMessage = {
  ...tool, id: "reasoning", variant: "reasoning", toolCall: undefined,
  reasoning: { id: "reasoning", status: "complete", chunks: ["Checking the source"] },
};
const shadow = "0 3px 9px rgb(20, 40, 60)";
const stylesheet = document.createElement("style");
let controller: AgentWidgetController | undefined;
beforeAll(() => {
  stylesheet.textContent = readFileSync("src/styles/widget.css", "utf8");
  document.head.append(stylesheet);
});
afterAll(() => stylesheet.remove());
afterEach(() => { controller?.destroy(); controller = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); });

const mount = (config: AgentWidgetConfig) => {
  const host = document.createElement("div");
  host.dataset.personaRoot = "true";
  applyThemeVariables(host, config);
  document.body.append(host);
  return host;
};
const builders = { tool: (config: AgentWidgetConfig) => createToolBubble(tool, config), reasoning: (config: AgentWidgetConfig) => createReasoningBubble(reasoning, config) };

describe.each([false, true])("activity shadows (V5 %s)", v5Defaults => {
  it.each(["row", "card"] as const)("keeps %s chrome independent of version defaults", layout => {
    const config = mergeWithDefaults({ future: { v5Defaults }, features: { toolCallDisplay: { layout }, reasoningDisplay: { layout } } });
    const host = mount(config);
    for (const [kind, build] of Object.entries(builders)) {
      const node = build(config); host.append(node);
      // JSDOM preserves CSS variable expressions: check the actual cascade and
      // transported values together. Browser verification resolves the variables.
      expect(getComputedStyle(node).boxShadow).toBe(layout === "row"
        ? `var(--persona-consumer-${kind === "tool" ? "tool" : "reasoning"}Bubble-shadow, none)`
        : kind === "tool" ? "var(--persona-tool-bubble-shadow)" : "var(--persona-reasoning-bubble-shadow)");
      expect(host.style.getPropertyValue(`--persona-consumer-${kind}Bubble-shadow`)).toBe("");
      const cardShadow = host.style.getPropertyValue(`--persona-${kind}-bubble-shadow`);
      expect(v5Defaults ? cardShadow === "none" : cardShadow !== "none" && cardShadow !== "").toBe(true);
    }
    if (layout === "row") {
      const group = createActivityGroup(tool, config, true, "Search (2)").bubble;
      host.append(group);
      expect(getComputedStyle(group).boxShadow).toBe("var(--persona-consumer-toolBubble-shadow, none)");
    }
  });

  it.each(["light", "dark"] as const)("preserves explicit component theme shadows in %s and clears them on reset", colorScheme => {
    let config = mergeWithDefaults({ future: { v5Defaults }, colorScheme, features: { toolCallDisplay: { layout: "row" }, reasoningDisplay: { layout: "row" } },
      theme: { components: { toolBubble: { shadow: "palette.shadows.sm" }, reasoningBubble: { shadow: "none" } } },
      darkTheme: { components: { toolBubble: { shadow }, reasoningBubble: { shadow } } },
    });
    const host = mount(config);
    for (const kind of ["tool", "reasoning"] as const) {
      const value = host.style.getPropertyValue(`--persona-consumer-${kind}Bubble-shadow`);
      expect(value).toBe(colorScheme === "dark" ? shadow : kind === "tool" ? host.style.getPropertyValue("--persona-palette-shadows-sm") : "none");
    }
    config = mergeConfigUpdate(config, { theme: undefined, darkTheme: undefined });
    applyThemeVariables(host, config);
    expect(host.style.getPropertyValue("--persona-consumer-toolBubble-shadow")).toBe("");
    expect(host.style.getPropertyValue("--persona-consumer-reasoningBubble-shadow")).toBe("");
  });

  it("retains explicit legacy tool shadows above theme shadows for rows, cards and groups", () => {
    for (const layout of ["row", "card"] as const) {
      let config = mergeWithDefaults({ future: { v5Defaults }, features: { toolCallDisplay: { layout } },
        toolCall: { shadow }, theme: { components: { toolBubble: { shadow: "none" } } },
      });
      expect(createToolBubble(tool, config).style.boxShadow).toBe(shadow);
      expect(createActivityGroup(tool, config, true, "Search (2)").bubble.style.boxShadow).toBe(shadow);
      config = mergeConfigUpdate(config, { toolCall: { shadow: "  " } });
      expect(createToolBubble(tool, config).style.boxShadow).toBe("none");
      expect(createActivityGroup(tool, config, true, "Search (2)").bubble.style.boxShadow).toBe("none");
      config = mergeConfigUpdate(config, { toolCall: { shadow: undefined } });
      expect(createToolBubble(tool, config).style.boxShadow).toBe(layout === "row" ? "var(--persona-consumer-toolBubble-shadow, none)" : "var(--persona-tool-bubble-shadow)");
      expect(createActivityGroup(tool, config, true, "Search (2)").bubble.style.boxShadow).toBe("var(--persona-consumer-toolBubble-shadow, none)");
    }
  });

  it("updates and resets shadows on the turn header, tool group, children and reasoning in saved history", async () => {
    window.scrollTo = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    controller = createAgentExperience(host, {
      persistState: false, future: { v5Defaults }, launcher: { enabled: false },
      voiceRecognition: { enabled: false }, turnActivity: { enabled: true },
      initialMessages: [reasoning, tool, { ...tool, id: "tool-two", toolCall: { ...tool.toolCall!, id: "tool-two" } }],
    });
    await controller.ready;
    const rows = () => [...host.querySelectorAll<HTMLElement>(".persona-activity-row")];
    expect(host.querySelector("[data-persona-turn-activity]")).not.toBeNull();
    expect(host.querySelector("[data-persona-tool-group]")).not.toBeNull();
    expect(rows()).toHaveLength(5);
    const checkRows = (legacy = false) => {
      for (const node of rows()) expect(getComputedStyle(node).boxShadow).toBe(legacy && node.dataset.activityKind === "tool"
        ? shadow : `var(--persona-consumer-${node.dataset.activityKind}Bubble-shadow, none)`);
    };
    checkRows();
    controller.update({ toolCall: { shadow }, theme: { components: { reasoningBubble: { shadow } } } });
    checkRows(true);
    const root = host;
    expect(root.style.getPropertyValue("--persona-consumer-reasoningBubble-shadow")).toBe(shadow);
    controller.update({ toolCall: { shadow: undefined }, theme: undefined });
    checkRows();
    expect(root.style.getPropertyValue("--persona-consumer-reasoningBubble-shadow")).toBe("");
  });
});
