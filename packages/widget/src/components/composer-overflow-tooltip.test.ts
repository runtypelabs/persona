import * as sharedIcons from "../utils/icons";
import * as sharedTooltips from "../utils/tooltip";
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createComposerOverflowMenu } from "./composer-overflow-menu";
import { resetTooltipTiming } from "../utils/tooltip";

describe("composer overflow tooltip", () => {
  let menu: ReturnType<typeof createComposerOverflowMenu>;
  beforeEach(() => {
    resetTooltipTiming({ delayMs: 0, skipDelayMs: 0 });
    menu = createComposerOverflowMenu({ deps: { renderLucideIcon: sharedIcons.renderLucideIcon, attachTooltip: sharedTooltips.attachTooltip }, label: "More actions" });
    document.body.appendChild(menu.trigger);
  });
  afterEach(() => {
    menu.destroy();
    resetTooltipTiming();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("shows a styled tooltip and updates its copy without a duplicate native tooltip", () => {
    menu.trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("More actions");
    expect(menu.triggerButton.hasAttribute("title")).toBe(false);
    menu.setLabel("Add files and tools");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Add files and tools");
  });

  it("suppresses the tooltip while the menu is open and cleans up on destroy", () => {
    menu.trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    menu.open();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    menu.trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    menu.close();
    menu.trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    menu.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("shows the label on keyboard focus", () => {
    vi.spyOn(menu.triggerButton, "matches").mockImplementation(selector => selector === ":focus-visible");
    menu.triggerButton.focus();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("More actions");
  });
});
