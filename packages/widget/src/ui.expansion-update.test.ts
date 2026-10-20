// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience, type AgentWidgetController } from "./ui";

let controller: AgentWidgetController;
let mount: HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  mount = document.createElement("div");
  document.body.appendChild(mount);
});

afterEach(() => {
  controller?.destroy();
  document.body.replaceChildren();
});

describe.each([false, true])("live expansion updates (initially expanded: %s)", expanded => {
  it.each([
    ["tool", "card"],
    ["tool", "row"],
    ["reasoning", "card"],
    ["reasoning", "row"],
    ["group", "row"],
  ] as const)("refreshes existing %s %s arrows and preserves disclosure state", (kind, variant) => {
    controller = createAgentExperience(mount, {
      apiUrl: "/test",
      persistState: false,
      future: { v5Defaults: true },
      launcher: { enabled: false },
      features: {
        toolCallDisplay: { variant, grouped: kind === "group", groupedMode: "collapsible", autoExpand: false, autoCollapseDelay: false },
        reasoningDisplay: { variant, autoExpand: false, autoCollapseDelay: false },
      },
    });
    for (let index = 1; index <= (kind === "group" ? 2 : 1); index++) {
      const id = `activity${index}`;
      controller.injectTestMessage({
        type: "message",
        message: {
          id,
          role: "assistant",
          content: "",
          createdAt: "2026-01-01T00:00:00Z",
          sequence: index,
          ...(kind === "reasoning"
            ? { variant: "reasoning", reasoning: { id, status: "complete", chunks: ["Reasoning details"] } }
            : { variant: "tool", toolCall: { id, name: "Search", status: "complete", chunks: ["Tool details"] } }),
        },
      });
    }
    const id = kind === "group" ? "tool-group-activity1" : "activity1";
    const header = () => mount.querySelector<HTMLButtonElement>(`[data-message-id="${id}"] > button`)!;
    if (expanded) {
      header().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      // Rebuild the wrapper after manual expansion so both states exercise the cache.
      controller.update({ theme: {} });
    }
    const arrow = () => header().querySelector<HTMLElement>(".persona-disclosure-chevron")!;
    const expectState = (rotation: string, duration: string, easing: string) => {
      expect(header().getAttribute("aria-expanded")).toBe(String(expanded));
      expect(arrow().style.transform).toBe(rotation);
      expect(arrow().style.transitionDuration).toBe(duration);
      expect(arrow().style.transitionTimingFunction).toBe(easing);
    };
    expectState(expanded ? "rotate(90deg)" : "rotate(0deg)", "160ms", "ease-out");

    // No message changes or toggles after initial setup: update() must repaint
    // cached message wrappers as well as the synthetic group header.
    controller.update({ expansion: {
      chevron: { collapsed: "left", expanded: "up" },
      animation: "height",
      duration: 300,
      easing: "linear",
    } });
    expectState(expanded ? "rotate(-90deg)" : "rotate(180deg)", "300ms", "linear");

    controller.update({ expansion: { chevron: { collapsed: "down", expanded: "right" } } });
    expectState(expanded ? "rotate(0deg)" : "rotate(90deg)", "300ms", "linear");

    controller.update({ expansion: undefined });
    expectState(expanded ? "rotate(90deg)" : "rotate(0deg)", "160ms", "ease-out");
  });
});
