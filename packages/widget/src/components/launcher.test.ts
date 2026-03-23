// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createLauncherButton } from "./launcher";
import { DEFAULT_WIDGET_CONFIG } from "../defaults";

describe("createLauncherButton", () => {
  it("applies collapsedMaxWidth when set", () => {
    const { element, update } = createLauncherButton(undefined, () => {});
    update({
      ...DEFAULT_WIDGET_CONFIG,
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        collapsedMaxWidth: "min(380px, calc(100vw - 48px))",
      },
    });
    expect(element.style.maxWidth).toBe("min(380px, calc(100vw - 48px))");
    element.remove();
  });

  it("sets title tooltip on launcher title and subtitle for truncated text", () => {
    const { element, update } = createLauncherButton(undefined, () => {});
    update({
      ...DEFAULT_WIDGET_CONFIG,
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        title: "Hello",
        subtitle: "Long subtitle for tooltip",
      },
    });
    const titleEl = element.querySelector("[data-role='launcher-title']");
    const subtitleEl = element.querySelector("[data-role='launcher-subtitle']");
    expect(titleEl?.getAttribute("title")).toBe("Hello");
    expect(subtitleEl?.getAttribute("title")).toBe("Long subtitle for tooltip");
    element.remove();
  });

  it("clears maxWidth when collapsedMaxWidth is unset", () => {
    const { element, update } = createLauncherButton(undefined, () => {});
    update({
      ...DEFAULT_WIDGET_CONFIG,
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        collapsedMaxWidth: "320px",
      },
    });
    expect(element.style.maxWidth).toBe("320px");
    update({
      ...DEFAULT_WIDGET_CONFIG,
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        collapsedMaxWidth: undefined,
      },
    });
    expect(element.style.maxWidth).toBe("");
    element.remove();
  });
});
