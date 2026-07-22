// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { createMentionButton } from "./context-mention-button";
import { renderLucideIcon } from "../utils/icons";
import type { AgentWidgetContextMentionConfig } from "../types";

// Icon rendered inside the default 40px button: iconSize = round(40 * 0.6) = 24,
// strokeWidth 1.5 (see createMentionButton). Compare against the registry's own
// output so the assertion tracks lucide glyph changes instead of hard-coding SVG.
const refIcon = (name: string) =>
  renderLucideIcon(name, 24, "currentColor", 1.5)!.innerHTML;

const config = (
  overrides: Partial<AgentWidgetContextMentionConfig> = {}
): AgentWidgetContextMentionConfig => ({ enabled: true, sources: [], ...overrides });

describe("createMentionButton", () => {
  it("invokes onOpen on click and labels itself from config", () => {
    const onOpen = vi.fn();
    const { button, wrapper } = createMentionButton({
      config: config({ buttonTooltipText: "Add context" }),
      onOpen,
    });
    expect(button.getAttribute("aria-label")).toBe("Add context");
    expect(wrapper.querySelector(".persona-send-button-tooltip")?.textContent).toBe(
      "Add context"
    );

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("defaults to a '+' add-context icon, not an '@' glyph", () => {
    const { button } = createMentionButton({ config: config(), onOpen: vi.fn() });
    const svg = button.querySelector("svg");
    expect(svg).not.toBeNull();
    // "@" reads as power-user; the consumer-recognized affordance is "+".
    expect(svg!.innerHTML).toBe(refIcon("plus"));
    expect(svg!.innerHTML).not.toBe(refIcon("at-sign"));
    expect(button.textContent).not.toContain("@");
  });

  it("honors a buttonIconName override for power-user surfaces", () => {
    const { button } = createMentionButton({
      config: config({ buttonIconName: "at-sign" }),
      onOpen: vi.fn(),
    });
    expect(button.querySelector("svg")!.innerHTML).toBe(refIcon("at-sign"));
  });

  it("stops the click from bubbling so the composer's focus-textarea handler never runs", () => {
    const parent = document.createElement("form");
    const parentClick = vi.fn();
    parent.addEventListener("click", parentClick);
    document.body.appendChild(parent);

    const { wrapper } = createMentionButton({ config: config(), onOpen: vi.fn() });
    parent.appendChild(wrapper);

    wrapper
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    // The button's handler calls stopPropagation, so the parent (which stands in
    // for the composer form's "click anywhere → focus textarea" listener) is
    // never reached — the picker's search field keeps focus.
    expect(parentClick).not.toHaveBeenCalled();
  });
});
