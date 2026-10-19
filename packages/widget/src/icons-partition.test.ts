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
    for (const name of ["bot", "send", "x", "arrow-up-right", "panel-left", "square-text"]) {
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
    vi.resetModules();
    const { renderLucideIcon } = await import("./utils/icons");
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

  it("keeps SVG shell attributes and caller styling when registration fills a pending icon", async () => {
    vi.resetModules();
    const { setIconsExtraLoader } = await import("./icons-extra-loader");
    setIconsExtraLoader(() => new Promise(() => {}));
    const { renderLucideIcon, registerIcons } = await import("./utils/icons");
    const svg = renderLucideIcon("shopping-cart", "1.25rem", "#123456", 3)!;
    svg.classList.add("persona-activity-icon");
    const shell = () => Object.fromEntries(Array.from(svg.attributes, ({ name, value }) => [name, value]).filter(([name]) => name !== "data-persona-icon-pending"));
    const before = shell();
    expect(before).toMatchObject({ width: "1.25rem", height: "1.25rem", viewBox: "0 0 24 24", fill: "none", stroke: "#123456", "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
    registerIcons({ "shopping-cart": [["path", { d: "M1 2L3 4" }]] });
    expect(svg.hasAttribute("data-persona-icon-pending")).toBe(false);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M1 2L3 4");
    expect(shell()).toEqual(before);
  });

  it("retries a failed extra-icon download and fills both old and new placeholders", async () => {
    vi.resetModules();
    const { setIconsExtraLoader } = await import("./icons-extra-loader");
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ EXTRA_LUCIDE_ICONS });
    setIconsExtraLoader(load);
    const { renderLucideIcon } = await import("./utils/icons");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const first = renderLucideIcon("shopping-cart")!;
      await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
      expect(first.hasAttribute("data-persona-icon-pending")).toBe(true);
      const second = renderLucideIcon("shopping-cart")!;
      await vi.waitFor(() => expect(second.hasAttribute("data-persona-icon-pending")).toBe(false));
      expect(first.hasAttribute("data-persona-icon-pending")).toBe(false);
      expect(first.innerHTML).toBe(second.innerHTML);
      expect(load).toHaveBeenCalledTimes(2);
    } finally { warn.mockRestore(); }
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
