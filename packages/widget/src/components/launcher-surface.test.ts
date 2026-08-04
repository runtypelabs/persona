// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLauncherSurface } from "./launcher";
import type {
  AgentWidgetConfig,
  AgentWidgetLauncherTeaserConfig,
} from "../types";

/**
 * Every case uses its own `keyPrefix`: the consumed-teaser set is module-level
 * (it is the page-load memory), so a shared key would leak between tests.
 */
let keyCounter = 0;
const nextPrefix = () => `teaser-test-${++keyCounter}-`;

const configWith = (
  prefix: string,
  teaser: AgentWidgetLauncherTeaserConfig
): AgentWidgetConfig => ({
  persistState: { keyPrefix: prefix },
  launcher: { teaser },
});

describe("createLauncherSurface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("stays a display:contents passthrough when no teaser is configured", () => {
    const surface = createLauncherSurface({ launcher: {} }, () => {});
    document.body.appendChild(surface.element);

    expect(surface.teaser).toBeNull();
    expect(surface.element.getAttribute("data-teaser")).toBeNull();
    expect(surface.element.className).toBe("persona-launcher-surface");
    expect(surface.element.firstElementChild).toBe(surface.launcher.element);
    expect(surface.launcher.element.style.position).toBe("");
    surface.destroy();
  });

  it("renders the teaser as a sibling of the launcher with its own dismiss button", () => {
    const prefix = nextPrefix();
    const surface = createLauncherSurface(
      configWith(prefix, { text: "Need a hand?" }),
      () => {}
    );
    document.body.appendChild(surface.element);
    vi.advanceTimersByTime(0);

    const teaser = surface.teaser;
    expect(teaser).not.toBeNull();
    expect(teaser?.element.parentElement).toBe(surface.element);
    expect(teaser?.element.getAttribute("aria-live")).toBe("polite");
    expect(teaser?.element.hidden).toBe(false);

    const buttons = teaser?.element.querySelectorAll("button") ?? [];
    expect(buttons.length).toBe(2);
    // Nested interactive elements are invalid HTML: both controls are siblings.
    expect(buttons[1].closest("button")).toBe(buttons[1]);
    expect(buttons[0].textContent).toBe("Need a hand?");

    expect(surface.element.getAttribute("data-teaser")).toBe("bottom-right");
    expect(surface.launcher.element.style.position).toBe("static");
    surface.destroy();
  });

  it("honors delayMs before showing", () => {
    const prefix = nextPrefix();
    const surface = createLauncherSurface(
      configWith(prefix, { text: "Hi there", delayMs: 3000 }),
      () => {}
    );
    expect(surface.teaser?.element.hidden).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(surface.teaser?.element.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(surface.teaser?.element.hidden).toBe(false);
    surface.destroy();
  });

  it("hides the dismiss affordance when dismissible is false", () => {
    const prefix = nextPrefix();
    const surface = createLauncherSurface(
      configWith(prefix, { text: "Hi there", dismissible: false }),
      () => {}
    );
    const dismiss = surface.teaser?.element.querySelectorAll("button")[1];
    expect(dismiss?.hidden).toBe(true);
    surface.destroy();
  });

  describe("consumption rules", () => {
    it("click-through opens the panel and persists under the default frequency", () => {
      const prefix = nextPrefix();
      const onToggle = vi.fn();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        onToggle
      );
      vi.advanceTimersByTime(0);

      surface.teaser?.element.querySelector("button")?.click();

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(surface.teaser?.element.hidden).toBe(true);
      expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBe("1");
      surface.destroy();
    });

    it("dismissal persists without opening the panel", () => {
      const prefix = nextPrefix();
      const onToggle = vi.fn();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        onToggle
      );
      vi.advanceTimersByTime(0);

      const buttons = surface.teaser?.element.querySelectorAll("button");
      buttons?.[1].click();

      expect(onToggle).not.toHaveBeenCalled();
      expect(surface.teaser?.element.hidden).toBe(true);
      expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBe("1");
      surface.destroy();
    });

    it("a launcher click consumes the visible teaser too", () => {
      const prefix = nextPrefix();
      const onToggle = vi.fn();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        onToggle
      );
      vi.advanceTimersByTime(0);

      surface.launcher.element.click();

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(surface.teaser?.element.hidden).toBe(true);
      expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBe("1");
      surface.destroy();
    });

    it("does not persist a teaser the user never saw", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there", delayMs: 5000 }),
        () => {}
      );

      surface.launcher.element.click();
      vi.advanceTimersByTime(10000);

      expect(surface.teaser?.element.hidden).toBe(true);
      expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBeNull();
      surface.destroy();
    });

    it("suppresses the teaser while the panel is open and never resurrects it", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there", delayMs: 100 }),
        () => {}
      );

      surface.setPanelOpen(true);
      vi.advanceTimersByTime(1000);
      expect(surface.teaser?.element.hidden).toBe(true);

      surface.setPanelOpen(false);
      surface.update(configWith(prefix, { text: "Hi there", delayMs: 100 }));
      vi.advanceTimersByTime(1000);
      expect(surface.teaser?.element.hidden).toBe(true);
      surface.destroy();
    });

    it("does not persist the flag when an automatic open consumes the teaser", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        () => {}
      );
      vi.advanceTimersByTime(0);
      expect(surface.teaser?.element.hidden).toBe(false);

      surface.setPanelOpen(true, "auto");

      expect(surface.teaser?.element.hidden).toBe(true);
      expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBeNull();
      surface.destroy();
    });

    it("appears at most once per page load under frequency always", () => {
      const prefix = nextPrefix();
      const config = configWith(prefix, { text: "Hi there", frequency: "always" });

      const first = createLauncherSurface(config, () => {});
      vi.advanceTimersByTime(0);
      first.teaser?.dismiss(false);
      expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBeNull();
      first.destroy();

      // Same page load, same key: the in-memory consumption still applies.
      const second = createLauncherSurface(config, () => {});
      vi.advanceTimersByTime(0);
      expect(second.teaser?.element.hidden).toBe(true);
      second.destroy();
    });

    it("skips the teaser when the persisted flag is already set", () => {
      const prefix = nextPrefix();
      window.localStorage.setItem(`${prefix}teaser-dismissed`, "1");

      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        () => {}
      );
      vi.advanceTimersByTime(0);
      expect(surface.teaser?.element.hidden).toBe(true);
      surface.destroy();
    });

    it("ignores a stale persisted flag under frequency always", () => {
      const prefix = nextPrefix();
      window.localStorage.setItem(`${prefix}teaser-dismissed`, "1");

      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there", frequency: "always" }),
        () => {}
      );
      vi.advanceTimersByTime(0);
      expect(surface.teaser?.element.hidden).toBe(false);
      surface.destroy();
    });

    it("keeps dismissal in memory when persistState is false", () => {
      const surface = createLauncherSurface(
        { persistState: false, launcher: { teaser: { text: "Hi there" } } },
        () => {}
      );
      vi.advanceTimersByTime(0);
      surface.teaser?.dismiss(true);

      expect(window.localStorage.getItem("persona-teaser-dismissed")).toBeNull();
      expect(surface.teaser?.element.hidden).toBe(true);
      surface.destroy();
    });
  });

  it("falls back to memory when localStorage throws", () => {
    const prefix = nextPrefix();
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    const config = configWith(prefix, { text: "Hi there" });
    const first = createLauncherSurface(config, () => {});
    vi.advanceTimersByTime(0);
    expect(first.teaser?.element.hidden).toBe(false);

    first.teaser?.dismiss(true);
    expect(first.teaser?.element.hidden).toBe(true);
    first.destroy();

    const second = createLauncherSurface(config, () => {});
    vi.advanceTimersByTime(0);
    expect(second.teaser?.element.hidden).toBe(true);
    second.destroy();

    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
  });

  describe("live updates", () => {
    it("adds a teaser configured by a later update()", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface({ launcher: {} }, () => {});
      expect(surface.teaser).toBeNull();

      surface.update(configWith(prefix, { text: "Added later" }));
      vi.advanceTimersByTime(0);

      expect(surface.teaser?.element.hidden).toBe(false);
      expect(surface.teaser?.element.textContent).toContain("Added later");
      expect(surface.element.getAttribute("data-teaser")).toBe("bottom-right");
      surface.destroy();
    });

    it("swaps teaser text in place", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "First" }),
        () => {}
      );
      vi.advanceTimersByTime(0);
      const element = surface.teaser?.element;

      surface.update(configWith(prefix, { text: "Second" }));

      expect(surface.teaser?.element).toBe(element);
      expect(element?.querySelector("button")?.textContent).toBe("Second");
      surface.destroy();
    });

    it("toggles the dismiss affordance", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        () => {}
      );
      const dismiss = () =>
        surface.teaser?.element.querySelectorAll("button")[1];
      expect(dismiss()?.hidden).toBe(false);

      surface.update(
        configWith(prefix, { text: "Hi there", dismissible: false })
      );
      expect(dismiss()?.hidden).toBe(true);

      surface.update(configWith(prefix, { text: "Hi there", dismissible: true }));
      expect(dismiss()?.hidden).toBe(false);
      surface.destroy();
    });

    it("removes the teaser and restores passthrough placement", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        configWith(prefix, { text: "Hi there" }),
        () => {}
      );
      vi.advanceTimersByTime(0);

      surface.update({ persistState: { keyPrefix: prefix }, launcher: {} });

      expect(surface.teaser).toBeNull();
      expect(surface.element.getAttribute("data-teaser")).toBeNull();
      expect(surface.launcher.element.style.position).toBe("");
      surface.destroy();
    });

    it("follows launcher.position onto the wrapper", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        {
          persistState: { keyPrefix: prefix },
          launcher: { teaser: { text: "Hi there" }, position: "top-left" },
        },
        () => {}
      );
      expect(surface.element.getAttribute("data-teaser")).toBe("top-left");
      expect(surface.element.className).toContain("persona-top-6");
      expect(surface.element.className).toContain("persona-left-6");
      surface.destroy();
    });

    it("drops the teaser in docked mount mode", () => {
      const prefix = nextPrefix();
      const surface = createLauncherSurface(
        {
          persistState: { keyPrefix: prefix },
          launcher: { teaser: { text: "Hi there" }, mountMode: "docked" },
        },
        () => {}
      );
      expect(surface.teaser).toBeNull();
      surface.destroy();
    });
  });

  it("clears the pending timer and removes the wrapper on destroy", () => {
    const prefix = nextPrefix();
    const surface = createLauncherSurface(
      configWith(prefix, { text: "Hi there", delayMs: 5000 }),
      () => {}
    );
    document.body.appendChild(surface.element);
    const teaserElement = surface.teaser?.element;

    surface.destroy();
    vi.advanceTimersByTime(10000);

    expect(vi.getTimerCount()).toBe(0);
    expect(teaserElement?.hidden).toBe(true);
    expect(surface.element.parentElement).toBeNull();
    expect(document.body.children.length).toBe(0);
  });
});
