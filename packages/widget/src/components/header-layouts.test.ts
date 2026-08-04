// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { buildMinimalHeader } from "./header-layouts";
import { HEADER_THEME_CSS } from "./header-builder";

const build = (layoutHeaderConfig: Parameters<typeof buildMinimalHeader>[0]["layoutHeaderConfig"]) =>
  buildMinimalHeader({
    config: { apiUrl: "https://example.com/api" },
    showClose: true,
    onClose: () => {},
    layoutHeaderConfig,
  });

describe("minimal header trailing actions", () => {
  it("clusters actions at the trailing edge with the close button's chrome", () => {
    const onAction = vi.fn();
    const elements = build({
      layout: "minimal",
      trailingActions: [{ id: "home", icon: "house", ariaLabel: "Back to home" }],
      onAction,
    });

    const button = elements.header.querySelector<HTMLButtonElement>(
      'button[aria-label="Back to home"]'
    );
    expect(button).not.toBeNull();

    // Trailing cluster, not the title row: the button shares a parent with
    // the close button wrapper and does not precede the title.
    expect(button!.parentElement).toBe(elements.closeButtonWrapper.parentElement);
    expect(elements.headerTitle.parentElement!.contains(button!)).toBe(false);

    // Close-button chrome: 32px round hit area, header action-icon color.
    expect(button!.style.height).toBe("32px");
    expect(button!.style.width).toBe("32px");
    expect(button!.style.color).toBe(HEADER_THEME_CSS.actionIconColor);
    expect(button!.className).toContain("persona-rounded-full");

    button!.click();
    expect(onAction).toHaveBeenCalledWith("home");
  });

  it("still ignores trailingActions when titleMenu is configured", () => {
    const elements = build({
      layout: "minimal",
      titleMenu: { menuItems: [{ id: "a", label: "A" }], onSelect: () => {} },
      trailingActions: [{ id: "home", icon: "house", ariaLabel: "Back to home" }],
    });

    expect(
      elements.header.querySelector('button[aria-label="Back to home"]')
    ).toBeNull();
  });
});
