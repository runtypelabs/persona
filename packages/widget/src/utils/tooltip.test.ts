// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachTooltip } from "./tooltip";

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
    button.focus();

    const tooltip = document.body.querySelector<HTMLElement>(
      ".persona-control-tooltip"
    );
    expect(tooltip?.dataset.placement).toBe("bottom");
    expect(tooltip?.style.top).toBe("52px");

    button.blur();
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("dismisses an open tooltip with Escape", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    attachTooltip({ anchor: button, text: "Close chat" });
    button.focus();
    expect(document.body.querySelector(".persona-control-tooltip")).not.toBeNull();

    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
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
    button.focus();
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
    button.focus();
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
    button.focus();
    expect(next.isOpen).toBe(false);
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("portals into the anchor's shadow root so widget styles still apply", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const button = document.createElement("button");
    shadow.appendChild(button);
    document.body.appendChild(host);

    attachTooltip({ anchor: button, text: "Shadow tooltip" });
    button.focus();

    expect(shadow.querySelector(".persona-control-tooltip")?.textContent).toContain(
      "Shadow tooltip"
    );
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
  });
});
