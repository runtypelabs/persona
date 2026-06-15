// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

// The header icon lives in the icon holder (the only `.persona-rounded-xl`
// element in the header zone; the close/clear buttons are `.persona-rounded-full`).
const HEADER_ICON_SELECTOR =
  '[data-persona-theme-zone="header"] .persona-rounded-xl svg';

describe("createAgentExperience header icon color", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders the header Lucide icon with currentColor so it inherits the themed icon color", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, headerIconName: "bot" },
    });

    const icon = mount.querySelector<SVGElement>(HEADER_ICON_SELECTOR);
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("stroke")).toBe("currentColor");
  });

  it("keeps the header icon on currentColor after controller.update (regression: was hardcoded #ffffff)", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, headerIconName: "bot", title: "Before" },
    });

    // A runtime update re-renders the header icon. It must preserve
    // `currentColor` so the themed `--persona-header-icon-fg` keeps applying;
    // previously this path hardcoded "#ffffff", so the icon color "wouldn't
    // stick" whenever the theme editor (or any update) ran.
    controller.update({
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, headerIconName: "bot", title: "After" },
    });

    const icon = mount.querySelector<SVGElement>(HEADER_ICON_SELECTOR);
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("stroke")).toBe("currentColor");
    expect(icon!.getAttribute("stroke")).not.toBe("#ffffff");
  });
});
