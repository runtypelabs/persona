// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachTooltip } from "./tooltip";

/**
 * Focus with a pinned keyboard-visible verdict. jsdom implements the spec's
 * focus-visible propagation, so a bare focus() verdict depends on what ran
 * before it; tests that open via focus must not be order-dependent.
 */
const focusVisible = (button: HTMLElement): void => {
  vi.spyOn(button, "matches").mockImplementation(
    (selector: string) => selector === ":focus-visible"
  );
  button.focus();
};

const rect = (
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

describe("attachTooltip", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("portals outside a clipped wrapper and clamps a long tooltip to the viewport", () => {
    const wrapper = document.createElement("div");
    wrapper.style.overflow = "hidden";
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Add context — a slide, element or comment");
    wrapper.appendChild(button);
    document.body.appendChild(wrapper);

    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 500,
    });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      rect(4, 400, 40, 40)
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("persona-control-tooltip")
          ? rect(0, 0, 300, 32)
          : rect(0, 0, 0, 0);
      }
    );

    attachTooltip({
      anchor: button,
      trigger: wrapper,
      text: () => button.getAttribute("aria-label") ?? "",
    });
    wrapper.dispatchEvent(new MouseEvent("mouseenter"));

    const tooltip = document.body.querySelector<HTMLElement>(
      ".persona-control-tooltip"
    );
    expect(tooltip).not.toBeNull();
    expect(wrapper.contains(tooltip)).toBe(false);
    expect(tooltip!.textContent).toContain("Add context");
    expect(tooltip!.style.left).toBe("8px");
    expect(tooltip!.style.getPropertyValue("--persona-tooltip-arrow-x")).toBe(
      "16px"
    );
    expect(tooltip!.dataset.placement).toBe("top");
  });

  it("flips below the control when there is not enough room above", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 300,
    });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      rect(200, 4, 40, 40)
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("persona-control-tooltip")
          ? rect(0, 0, 120, 32)
          : rect(0, 0, 0, 0);
      }
    );

    attachTooltip({ anchor: button, text: "Close chat" });
    focusVisible(button);

    const tooltip = document.body.querySelector<HTMLElement>(
      ".persona-control-tooltip"
    );
    expect(tooltip?.dataset.placement).toBe("bottom");
    expect(tooltip?.style.top).toBe("52px");

    button.blur();
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("stays closed on focus that is not focus-visible", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    // jsdom reports every focus as :focus-visible; model a browser's
    // programmatic-focus-after-mouse verdict instead.
    vi.spyOn(button, "matches").mockImplementation(
      (selector: string) => selector !== ":focus-visible"
    );

    attachTooltip({ anchor: button, text: "Close chat" });
    button.focus();
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("dismisses an open tooltip with Escape", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    attachTooltip({ anchor: button, text: "Close chat" });
    focusVisible(button);
    expect(document.body.querySelector(".persona-control-tooltip")).not.toBeNull();

    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("dismisses on activation and reopens with the label the control now has", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Collapse conversation list");
    document.body.appendChild(button);
    const tip = () =>
      document.body.querySelector<HTMLElement>(".persona-control-tooltip");

    attachTooltip({
      anchor: button,
      text: () => button.getAttribute("aria-label") ?? "",
    });
    button.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tip()?.textContent).toContain("Collapse conversation list");

    // The pointer never left, so nothing but the activation closes it.
    button.click();
    expect(tip()).toBeNull();

    button.setAttribute("aria-label", "Expand conversation list");
    button.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tip()?.textContent).toContain("Expand conversation list");
  });

  it("dismisses a keyboard-opened tooltip on activation until focus returns", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const tip = () => document.body.querySelector(".persona-control-tooltip");

    attachTooltip({ anchor: button, text: "Close chat" });
    focusVisible(button);
    expect(tip()).not.toBeNull();

    // Space/Enter activates without moving focus off the control.
    button.click();
    expect(tip()).toBeNull();

    button.blur();
    focusVisible(button);
    expect(tip()).not.toBeNull();
  });

  it("suppresses hover tooltips when the device has no hover capability", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true })
    );
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Add context");
    document.body.appendChild(button);

    attachTooltip({
      anchor: button,
      text: () => button.getAttribute("aria-label") ?? "",
    });
    button.dispatchEvent(new MouseEvent("mouseenter"));

    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Add context");
  });

  it("repositions an open tooltip after resize and scroll", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 300,
    });
    let anchorLeft = 100;
    vi.spyOn(button, "getBoundingClientRect").mockImplementation(() =>
      rect(anchorLeft, 200, 40, 40)
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("persona-control-tooltip")
          ? rect(0, 0, 120, 32)
          : rect(0, 0, 0, 0);
      }
    );

    attachTooltip({ anchor: button, text: "Add context" });
    focusVisible(button);
    const tooltip = document.body.querySelector<HTMLElement>(
      ".persona-control-tooltip"
    );
    expect(tooltip?.style.left).toBe("60px");

    anchorLeft = 200;
    window.dispatchEvent(new Event("resize"));
    expect(tooltip?.style.left).toBe("160px");

    anchorLeft = 300;
    window.dispatchEvent(new Event("scroll"));
    expect(tooltip?.style.left).toBe("260px");
  });

  it("cleans up an open tooltip when its anchor is removed", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    attachTooltip({ anchor: button, text: "Add context" });
    focusVisible(button);
    expect(document.body.querySelector(".persona-control-tooltip")).not.toBeNull();

    button.remove();

    await vi.waitFor(() => {
      expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
    });
  });

  it("re-attaching replaces old listeners and disabled tooltips stay closed", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const old = attachTooltip({ anchor: button, text: "Old" });
    const next = attachTooltip({ anchor: button, text: "New", enabled: false });

    expect(old.isOpen).toBe(false);
    focusVisible(button);
    expect(next.isOpen).toBe(false);
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("renders a shortcut hint chip and refreshes it alongside the label", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "New conversation");
    document.body.appendChild(button);
    let hint = "⌘K";

    attachTooltip({
      anchor: button,
      text: () => button.getAttribute("aria-label") ?? "",
      hint: () => hint,
    });
    focusVisible(button);

    const chip = () =>
      document.body.querySelector<HTMLElement>(
        ".persona-control-tooltip__hint"
      );
    expect(chip()?.textContent).toBe("⌘K");

    hint = "⌘⇧K";
    window.dispatchEvent(new Event("resize"));
    expect(chip()?.textContent).toBe("⌘⇧K");
  });

  it("renders no hint chip when the hint is absent or empty", () => {
    const bare = document.createElement("button");
    const blank = document.createElement("button");
    document.body.append(bare, blank);

    attachTooltip({ anchor: bare, text: "Close chat" });
    focusVisible(bare);
    expect(
      document.body.querySelector(".persona-control-tooltip__hint")
    ).toBeNull();
    bare.blur();

    attachTooltip({ anchor: blank, text: "Close chat", hint: () => "  " });
    focusVisible(blank);
    expect(
      document.body.querySelector(".persona-control-tooltip__hint")
    ).toBeNull();
  });

  it("copies the anchor's resolved theme variables onto a body-portaled tooltip", () => {
    const mount = document.createElement("div");
    const button = document.createElement("button");
    mount.appendChild(button);
    document.body.appendChild(mount);

    // The mount carries the theme; jsdom does not inherit custom properties,
    // so the anchor's computed style is stubbed the way a browser resolves it.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element: Element) =>
        ({
          getPropertyValue: (name: string) =>
            element === button
              ? ({
                  "--persona-tooltip-background": "#1d4ed8",
                  "--persona-tooltip-hint-fg": "rgba(255,255,255,0.6)",
                  "--persona-tooltip-arrow-display": "none",
                  "--persona-radius-sm": "0.5rem",
                })[name] ?? ""
              : "",
        }) as CSSStyleDeclaration
    );

    attachTooltip({ anchor: button, text: "Close chat", hint: "Esc" });
    focusVisible(button);

    const tooltip = document.body.querySelector<HTMLElement>(
      ".persona-control-tooltip"
    );
    expect(tooltip!.style.getPropertyValue("--persona-tooltip-background")).toBe(
      "#1d4ed8"
    );
    expect(tooltip!.style.getPropertyValue("--persona-tooltip-hint-fg")).toBe(
      "rgba(255,255,255,0.6)"
    );
    // arrow: false rides along, so a themed tooltip hides the caret off-mount.
    expect(
      tooltip!.style.getPropertyValue("--persona-tooltip-arrow-display")
    ).toBe("none");
    expect(tooltip!.style.getPropertyValue("--persona-radius-sm")).toBe("0.5rem");
    // Unresolved variables are never written as empty declarations.
    expect(tooltip!.style.getPropertyValue("--persona-tooltip-padding")).toBe("");
  });

  it("portals into the anchor's shadow root so widget styles still apply", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const button = document.createElement("button");
    shadow.appendChild(button);
    document.body.appendChild(host);

    attachTooltip({ anchor: button, text: "Shadow tooltip" });
    focusVisible(button);

    expect(shadow.querySelector(".persona-control-tooltip")?.textContent).toContain(
      "Shadow tooltip"
    );
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });
});
