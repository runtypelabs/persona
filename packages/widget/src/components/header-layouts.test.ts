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

    // Trailing cluster, not the title row: the action's wrapper shares a
    // parent with the close button wrapper and does not precede the title.
    expect(button!.parentElement!.parentElement).toBe(
      elements.closeButtonWrapper.parentElement
    );
    expect(elements.headerTitle.parentElement!.contains(button!)).toBe(false);

    // Shared header control chrome: token-sized box, no inline size, header
    // action-icon color.
    expect(button!.classList.contains("persona-header-control")).toBe(true);
    expect(button!.classList.contains("persona-header-control--glyph")).toBe(true);
    expect(button!.style.width).toBe("");
    expect(button!.style.height).toBe("");
    expect(button!.style.color).toBe(HEADER_THEME_CSS.actionIconColor);
    expect(button!.className).toContain("persona-rounded-full");
    // Flex wrapper: an inline-flex button in a block wrapper reserves baseline
    // slack and rides high.
    expect(button!.parentElement!.className).toContain("persona-inline-flex");

    button!.click();
    expect(onAction).toHaveBeenCalledWith("home");
  });

  it("keeps the close button transparent so the UA button fill never shows", () => {
    const elements = build({ layout: "minimal" });
    expect(elements.closeButton.className).toContain("persona-bg-transparent");
    expect(elements.closeButton.className).toContain("hover:persona-bg-gray-100");
    expect(elements.closeButton.style.backgroundColor).toBe("");
  });

  it("shares the header control chrome and a flex wrapper with the default layout", () => {
    const elements = build({ layout: "minimal" });
    expect(elements.closeButton.classList.contains("persona-header-control")).toBe(true);
    // Sparse X glyph: the stylesheet scales it up from the icon-size token.
    expect(
      elements.closeButton.classList.contains("persona-header-control--sparse")
    ).toBe(true);
    expect(elements.closeButton.style.width).toBe("");
    // The centering bug: a block wrapper reserves inline baseline slack, so
    // the button rides high inside it.
    expect(elements.closeButtonWrapper.className).toContain("persona-inline-flex");
    expect(elements.closeButtonWrapper.className).toContain("persona-items-center");
  });

  it("applies closeButtonBackgroundColor instead of the transparent default", () => {
    const elements = buildMinimalHeader({
      config: {
        apiUrl: "https://example.com/api",
        launcher: { closeButtonBackgroundColor: "red" },
      },
      showClose: true,
      onClose: () => {},
      layoutHeaderConfig: { layout: "minimal" },
    });
    expect(elements.closeButton.style.backgroundColor).toBe("red");
    expect(elements.closeButton.className).not.toContain("persona-bg-transparent");
    expect(elements.closeButton.className).not.toContain("hover:persona-bg-gray-100");
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
