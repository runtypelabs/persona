// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { wrapScrollableTables, refreshTableScrollFades } from "./table-scroll-fade";

// Off-edge fade value: a themeable token reference, not a resolved px length.
const FADE_ON = "var(--persona-md-table-scroll-fade, 24px)";

// jsdom has no layout, so scroll metrics are stubbed per element.
function stubMetrics(
  el: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft = 0 }: { scrollWidth: number; clientWidth: number; scrollLeft?: number }
): void {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  let sl = scrollLeft;
  Object.defineProperty(el, "scrollLeft", {
    get: () => sl,
    set: (v: number) => {
      sl = v;
    },
    configurable: true,
  });
}

function makeContainerWithTable(): { container: HTMLElement; table: HTMLElement } {
  const container = document.createElement("div");
  const bubble = document.createElement("div");
  bubble.className = "persona-message-content";
  const table = document.createElement("table");
  table.innerHTML = "<tbody><tr><td>a</td></tr></tbody>";
  bubble.appendChild(table);
  container.appendChild(bubble);
  return { container, table };
}

describe("wrapScrollableTables", () => {
  it("wraps a bare table in a .persona-table-scroll container", () => {
    const { container, table } = makeContainerWithTable();
    wrapScrollableTables(container);
    const wrapper = table.parentElement!;
    expect(wrapper.className).toBe("persona-table-scroll");
    expect(wrapper.firstElementChild).toBe(table);
  });

  it("is idempotent: an already-wrapped table is not double-wrapped", () => {
    const { container, table } = makeContainerWithTable();
    wrapScrollableTables(container);
    wrapScrollableTables(container);
    expect(container.querySelectorAll(".persona-table-scroll").length).toBe(1);
    expect(table.parentElement!.parentElement!.className).toBe("persona-message-content");
  });
});

describe("refreshTableScrollFades", () => {
  let container: HTMLElement;
  let wrapper: HTMLElement;

  beforeEach(() => {
    const built = makeContainerWithTable();
    container = built.container;
    wrapScrollableTables(container);
    wrapper = built.table.parentElement!;
  });

  it("marks an overflowing table scrollable and fades only the right edge at start", () => {
    stubMetrics(wrapper, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    refreshTableScrollFades(container);
    expect(wrapper.hasAttribute("data-persona-scroll-x")).toBe(true);
    expect(wrapper.style.getPropertyValue("--persona-fade-l")).toBe("0px");
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe(FADE_ON);
  });

  it("fades only the left edge when scrolled to the end", () => {
    stubMetrics(wrapper, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
    refreshTableScrollFades(container);
    expect(wrapper.style.getPropertyValue("--persona-fade-l")).toBe(FADE_ON);
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe("0px");
  });

  it("fades both edges mid-scroll", () => {
    stubMetrics(wrapper, { scrollWidth: 600, clientWidth: 300, scrollLeft: 120 });
    refreshTableScrollFades(container);
    expect(wrapper.style.getPropertyValue("--persona-fade-l")).toBe(FADE_ON);
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe(FADE_ON);
  });

  // RTL scrolls on the negative model: scrollLeft runs [-overflow, 0], starting
  // at 0 with the hidden content to the physical left (mirror of LTR).
  it("fades the left edge at an RTL table's start position", () => {
    wrapper.style.direction = "rtl";
    stubMetrics(wrapper, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    refreshTableScrollFades(container);
    expect(wrapper.style.getPropertyValue("--persona-fade-l")).toBe(FADE_ON);
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe("0px");
  });

  it("fades the right edge when an RTL table is scrolled to its end", () => {
    wrapper.style.direction = "rtl";
    stubMetrics(wrapper, { scrollWidth: 600, clientWidth: 300, scrollLeft: -300 });
    refreshTableScrollFades(container);
    expect(wrapper.style.getPropertyValue("--persona-fade-l")).toBe("0px");
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe(FADE_ON);
  });

  it("leaves a table that fits unmarked (no fade)", () => {
    stubMetrics(wrapper, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    refreshTableScrollFades(container);
    expect(wrapper.hasAttribute("data-persona-scroll-x")).toBe(false);
  });

  it("updates fades when the table is scrolled (delegated capture listener)", () => {
    stubMetrics(wrapper, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    refreshTableScrollFades(container);
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe(FADE_ON);
    // Simulate a real scroll to the end: move position, fire the event the
    // container's capture-phase listener is waiting for.
    wrapper.scrollLeft = 300;
    wrapper.dispatchEvent(new Event("scroll"));
    expect(wrapper.style.getPropertyValue("--persona-fade-l")).toBe(FADE_ON);
    expect(wrapper.style.getPropertyValue("--persona-fade-r")).toBe("0px");
  });
});
