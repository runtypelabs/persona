// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createToolBubble } from "./tool-bubble";
import { mergeWithDefaults } from "../defaults";
import { mergeConfigUpdate } from "../utils/config-merge";
import { applyToolPadding } from "../utils/tool-styles";
import type { AgentWidgetMessage } from "../types";

const message: AgentWidgetMessage = {
  id: "styled-tool", role: "assistant", content: "", createdAt: new Date(0).toISOString(), variant: "tool",
  toolCall: { id: "call", name: "lookup", status: "complete", args: { query: "example" }, result: "Found" },
};

describe.each([false, true])("tool theme migration v5=%s", (v5Defaults) => {
  it("styles both tool detail variants, retaining per-axis legacy overrides", () => {
    const config = mergeWithDefaults({ future: { v5Defaults }, toolCall: { headerPaddingX: "19px", contentTextColor: "red" },
      theme: { components: { toolBubble: { background: "#abcdef", header: { padding: "8px 10px", foreground: "blue" },
        content: { foreground: "green", padding: "12px" }, codeBlock: { background: "#112233", foreground: "#ffffff" }, labelForeground: "purple" } } },
    });
    const bubble = createToolBubble(message, config, new Set([message.id]));
    expect(bubble.style.backgroundColor).toContain("--persona-components-toolBubble-background");
    const header = bubble.querySelector("button")!;
    expect(header.style.paddingLeft).toBe("19px");
    expect(header.style.getPropertyValue("--persona-theme-padding")).toContain("--persona-components-toolBubble-header-padding");
    const body = bubble.querySelector<HTMLElement>(":scope > .persona-border-t")!;
    expect(body.style.color).toBe("red");
    const pre = body.querySelector("pre")!;
    expect(pre.style.color).toContain("--persona-components-toolBubble-codeBlock-foreground");
    const styledBlock = v5Defaults ? pre.closest<HTMLElement>("section")! : pre;
    expect(styledBlock.style.backgroundColor).toContain("--persona-components-toolBubble-codeBlock-background");
  });

  it("exposes theme values after a legacy override is reset", () => {
    const initial = mergeWithDefaults({ future: { v5Defaults }, toolCall: { backgroundColor: "red" },
      theme: { components: { toolBubble: { background: "blue" } } },
    });
    expect(createToolBubble(message, initial).style.backgroundColor).toBe("red");
    const reset = mergeConfigUpdate(initial, { toolCall: { backgroundColor: undefined } });
    expect(createToolBubble(message, reset).style.backgroundColor).toContain("--persona-components-toolBubble-background");
  });

  it("keeps animation duration units and explicit legacy precedence", () => {
    const active = { ...message, toolCall: { ...message.toolCall!, status: "running" as const } };
    const config = mergeWithDefaults({ future: { v5Defaults }, theme: { components: { toolBubble: { loading: { duration: "750ms" } } } },
      features: { toolCallDisplay: { loadingAnimation: "pulse" } },
    });
    expect(createToolBubble(active, config).querySelector<HTMLElement>("[data-preserve-animation]")!.style.getPropertyValue("--persona-tool-anim-duration")).toContain("--persona-components-toolBubble-loading-duration");
    const legacy = mergeConfigUpdate(config, { toolCall: { loadingAnimationDuration: 320 } });
    expect(createToolBubble(active, legacy).querySelector<HTMLElement>("[data-preserve-animation]")!.style.getPropertyValue("--persona-tool-anim-duration")).toBe("320ms");
  });
});


describe("tool padding cascade and updates", () => {
  it.each([false, true])("keeps theme padding above utilities and activity defaults (v5=%s)", (v5Defaults) => {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/styles/widget.css", "utf8");
    document.head.appendChild(style);
    const config = mergeWithDefaults({ future: { v5Defaults }, theme: { components: { toolBubble: { header: { padding: "10px 16px" }, content: { padding: "12px 16px" } } } } });
    const bubble = createToolBubble(message, config, new Set([message.id]));
    document.body.appendChild(bubble);
    const header = bubble.querySelector<HTMLElement>(":scope > button")!;
    const content = bubble.querySelector<HTMLElement>(":scope > .persona-border-t")!;
    expect(header.classList.contains("persona-theme-padding")).toBe(true);
    expect(getComputedStyle(header).padding).toBe("var(--persona-theme-padding)");
    expect(getComputedStyle(content).padding).toBe("var(--persona-theme-padding)");
    bubble.remove(); style.remove();
  });

  it("clears old axes and theme hooks on reuse and restores each axis independently", () => {
    const header = document.createElement("button");
    let config = mergeWithDefaults({ theme: { components: { toolBubble: { header: { padding: "10px 16px" } } } }, toolCall: { headerPaddingX: "20px", headerPaddingY: "30px" } });
    applyToolPadding(header, config, "header");
    expect(header.style.paddingLeft).toBe("20px");
    expect(header.style.paddingTop).toBe("30px");
    config = mergeConfigUpdate(config, { toolCall: { headerPaddingX: undefined } });
    applyToolPadding(header, config, "header");
    expect(header.style.paddingLeft).toBe("");
    expect(header.style.paddingTop).toBe("30px");
    expect(header.classList.contains("persona-theme-padding")).toBe(true);
    config = mergeConfigUpdate(config, { toolCall: undefined, theme: { components: { toolBubble: { header: { padding: undefined } } } } });
    applyToolPadding(header, config, "header");
    expect(header.style.paddingTop).toBe("");
    expect(header.classList.contains("persona-theme-padding")).toBe(false);
    expect(header.style.getPropertyValue("--persona-theme-padding")).toBe("");
  });
});
