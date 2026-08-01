// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderLucideIcon } from "./icons";

describe("renderLucideIcon", () => {
  it.each(["lightbulb", "chart-column", "image", "pen-line"] as const)(
    "renders %s as an inline svg",
    (name) => {
      const svg = renderLucideIcon(name);
      expect(svg).not.toBeNull();
      expect(svg?.tagName.toLowerCase()).toBe("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      // Geometry, not an empty shell.
      expect(svg!.childNodes.length).toBeGreaterThan(0);
    }
  );

  it("returns null and warns for a name outside the registry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(renderLucideIcon("definitely-not-an-icon")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
