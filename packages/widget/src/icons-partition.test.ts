// @vitest-environment jsdom

/**
 * Contract tests for the two-tier icon registry.
 *
 * The EXTRA_ICON_NAMES list (core, ~0.8 kB of strings) and the
 * EXTRA_LUCIDE_ICONS data map (lazy icons-extra chunk) are maintained by hand
 * in two files; the partition test keeps them in lockstep. The behavior tests
 * pin the heal contract: extra names return a sized placeholder that fills IN
 * PLACE when the chunk lands, subscribing is passive (the render kicks the
 * fetch, never the subscription — see the markdown-parsers lesson), and
 * registerIcons() extends the registry at runtime.
 */
import { describe, expect, it, vi } from "vitest";

import {
  EXTRA_ICON_NAMES,
  onExtraIconsReady,
  registerIcons,
  renderLucideIcon,
} from "./utils/icons";
import { EXTRA_LUCIDE_ICONS } from "./icons-extra";

describe("icon registry partition", () => {
  it("EXTRA_ICON_NAMES matches the chunk's map keys exactly", () => {
    const listed = [...EXTRA_ICON_NAMES].sort();
    const shipped = Object.keys(EXTRA_LUCIDE_ICONS).sort();
    expect(listed).toEqual(shipped);
  });

  it("core names resolve synchronously with real content", () => {
    for (const name of ["bot", "send", "x", "arrow-up-right", "panel-left"]) {
      const svg = renderLucideIcon(name);
      expect(svg, `core icon "${name}"`).not.toBeNull();
      expect(svg!.hasAttribute("data-persona-icon-pending")).toBe(false);
      expect(svg!.childNodes.length).toBeGreaterThan(0);
    }
  });

  it("unknown names warn and return null (no chunk fetch)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(renderLucideIcon("definitely-not-an-icon")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("extra names return a sized pending placeholder that fills in place", async () => {
    // In vitest the loader's fallback import resolves via the alias, so the
    // fill happens after a microtask hop.
    const svg = renderLucideIcon("shopping-cart", 20);
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("width")).toBe("20");
    expect(svg!.getAttribute("data-persona-icon-pending")).toBe("true");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(svg!.hasAttribute("data-persona-icon-pending")).toBe(false);
    expect(svg!.childNodes.length).toBeGreaterThan(0);
  });

  it("onExtraIconsReady fires once after adoption; registerIcons extends the registry", async () => {
    const cb = vi.fn();
    onExtraIconsReady(cb);
    // The previous test already adopted the chunk in this module instance, so
    // the subscription no-ops; a fresh custom icon still registers and renders.
    registerIcons({
      "custom-test-icon": [["circle", { cx: "12", cy: "12", r: "4" }]],
    });
    const svg = renderLucideIcon("custom-test-icon");
    expect(svg).not.toBeNull();
    expect(svg!.childNodes.length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Already-adopted subscription contract: no late fire.
    expect(cb).not.toHaveBeenCalled();
  });
});
