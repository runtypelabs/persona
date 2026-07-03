// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { createMentionButton } from "./context-mention-button";
import type { AgentWidgetContextMentionConfig } from "../types";

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
