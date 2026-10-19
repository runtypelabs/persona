// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { mergeWithDefaults } from "../defaults";
import { mergeConfigUpdate } from "../utils/config-merge";
import { createReasoningBubble, updateReasoningBubbleUI } from "./reasoning-bubble";

const message: AgentWidgetMessage = {
  id: "trace", role: "assistant", content: "", createdAt: "2026-01-01", variant: "reasoning",
  reasoning: { id: "trace", status: "complete", chunks: Array.from({ length: 15 }, () => "A long reasoning paragraph.\n\n") },
};
const bodyOf = (bubble: HTMLElement) => bubble.querySelector<HTMLElement>(".persona-activity-scroll")!;
afterEach(() => document.body.replaceChildren());

describe("expanded reasoning overflow", () => {
  it("uses theme/CSS defaults without duplicating a cap in resolved config", () => {
    for (const v5Defaults of [false, true]) {
      const config = { future: { v5Defaults } };
      const resolved = mergeWithDefaults(config);
      expect(bodyOf(createReasoningBubble(message, resolved as AgentWidgetConfig)).style.maxHeight).toBe("");
      const body = bodyOf(createReasoningBubble(message, config, new Set([message.id])));
      expect(body.style.maxHeight).toBe("");
      expect(body.tabIndex).toBe(0);
      if (v5Defaults) {
        expect(body.getAttribute("role")).toBe("region");
        expect(body.getAttribute("aria-label")).toBe("Reasoning");
      }
    }
  });

  it.each(["plain", "inset", "panel"] as const)("caps the inner text across row/card %s treatments", appearance => {
    for (const layout of ["row", "card"] as const) {
      const bubble = createReasoningBubble(message, { future: { v5Defaults: true }, features: { reasoningDisplay: { appearance, layout, maxHeight: "140px" } } }, new Set([message.id]));
      const body = bodyOf(bubble);
      expect(body.style.maxHeight).toBe("140px");
      expect(body.textContent).toBe(message.reasoning!.chunks.join(""));
      expect(body.parentElement?.style.maxHeight).toBe("");
      expect(body.parentElement?.parentElement?.style.display).toBe("");
      expect(bubble.dataset.appearance).toBe(appearance);
      expect(bubble.classList.contains("persona-activity-row")).toBe(layout === "row");
    }
  });

  it("lets the explicit compatibility cap win over both theme levels", () => {
    const config: AgentWidgetConfig = { future: { v5Defaults: true }, theme: { components: {
      activity: { overflow: { maxHeight: "300px" } }, reasoningBubble: { overflow: { maxHeight: "180px" } },
    } }, features: { reasoningDisplay: { maxHeight: "100px" } } };
    expect(bodyOf(createReasoningBubble(message, config)).style.maxHeight).toBe("100px");
    config.features!.reasoningDisplay!.maxHeight = undefined;
    expect(bodyOf(createReasoningBubble(message, config)).style.maxHeight).toBe("");
  });

  it("supports unlimited and live reset back to the version default", () => {
    for (const v5Defaults of [false, true]) {
      let config = mergeWithDefaults({ future: { v5Defaults }, features: { reasoningDisplay: { maxHeight: "140px" } } }) as AgentWidgetConfig;
      config = mergeConfigUpdate(config, { features: { reasoningDisplay: { maxHeight: "none" } } });
      let body = bodyOf(createReasoningBubble(message, config));
      expect(body.style.maxHeight).toBe("none");
      expect(body.tabIndex).toBe(0);
      config = mergeConfigUpdate(config, { features: { reasoningDisplay: { maxHeight: undefined } } });
      body = bodyOf(createReasoningBubble(message, config));
      expect(body.style.maxHeight).toBe("");
    }
  });

  it("keeps the capped inner body outside disclosure visibility and focus handling", () => {
    const config: AgentWidgetConfig = { future: { v5Defaults: true }, expansion: { animation: "height", duration: 160 } };
    const expanded = new Set([message.id]);
    const bubble = createReasoningBubble(message, config, expanded);
    document.body.append(bubble);
    const body = bodyOf(bubble);
    const boundary = body.parentElement!.parentElement!;
    body.focus();
    expanded.clear();
    updateReasoningBubbleUI(message.id, bubble, expanded, config);
    expect(boundary.inert).toBe(true);
    expect(boundary.style.display).toBe("none");
    expect(document.activeElement).toBe(bubble.querySelector("button"));
    expect(body.style.maxHeight).toBe("");
    expanded.add(message.id);
    updateReasoningBubbleUI(message.id, bubble, expanded, config);
    expect(boundary.inert).toBe(false);
    expect(boundary.style.display).toBe("");
    expect(body.style.maxHeight).toBe("");
  });
});
