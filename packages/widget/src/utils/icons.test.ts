// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderLucideIcon } from "./icons";

describe("renderLucideIcon", () => {
  it.each(["bot", "send", "chevron-down", "panel-left"] as const)(
    "renders core-tier %s as an inline svg synchronously",
    (name) => {
      const svg = renderLucideIcon(name);
      expect(svg).not.toBeNull();
      expect(svg?.tagName.toLowerCase()).toBe("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      // Geometry, not an empty shell.
      expect(svg!.childNodes.length).toBeGreaterThan(0);
    }
  );

  it.each(["lightbulb", "chart-column", "image", "pen-line"] as const)(
    "renders extra-tier %s as a sized placeholder that fills once the chunk lands",
    async (name) => {
      const svg = renderLucideIcon(name);
      expect(svg).not.toBeNull();
      expect(svg?.tagName.toLowerCase()).toBe("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      // Fills in place after the lazy chunk resolves (vitest alias; the very
      // first load includes the module transform, so poll rather than assume
      // a fixed number of hops).
      await vi.waitFor(() => {
        expect(svg!.hasAttribute("data-persona-icon-pending")).toBe(false);
      });
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
