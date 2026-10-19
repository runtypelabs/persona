// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderLucideIcon } from "./icons";

describe("renderLucideIcon", () => {
  it("renders square-text as a rounded square with horizontal text lines", () => {
    const svg = renderLucideIcon("square-text", 16)!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke-width")).toBe("2");
    expect(svg.getAttribute("stroke-linecap")).toBe("round");
    expect(svg.hasAttribute("data-persona-icon-pending")).toBe(false);
    const square = svg.querySelector("rect")!;
    expect(["x", "y", "width", "height", "rx"].map(attr => square.getAttribute(attr))).toEqual(["3", "3", "18", "18", "2"]);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M7 8h10M7 12h10M7 16h6");
  });

  it.each(["bot", "send", "chevron-down", "panel-left", "square-text"] as const)(
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

  // Every icon the message-action row asks for by string literal has to be in
  // the registry, or the button ships with no glyph and warns on every render.
  it.each([
    "copy",
    "volume-2",
    "thumbs-up",
    "thumbs-down",
    "refresh-cw",
    "pencil",
    "quote",
  ] as const)("has %s registered for the message action row", (name) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const svg = renderLucideIcon(name);
    expect(svg).not.toBeNull();
    expect(svg!.childNodes.length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null and warns for a name outside the registry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(renderLucideIcon("definitely-not-an-icon")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
