// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { createRovingTablist } from "./roving-tablist";

const makeTabs = (container: HTMLElement, count: number): HTMLElement[] => {
  const tabs: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `tab-${i}`;
    container.appendChild(b);
    tabs.push(b);
  }
  return tabs;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createRovingTablist", () => {
  it("applies role=tablist/tab, aria-selected, and a single roving tabindex", () => {
    const container = document.createElement("div");
    const tabs = makeTabs(container, 3);
    const controller = createRovingTablist(container, { onSelect: () => {} });
    controller.render(tabs, 1);

    expect(container.getAttribute("role")).toBe("tablist");
    expect(tabs.every((t) => t.getAttribute("role") === "tab")).toBe(true);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    // Only the selected tab is the tab stop.
    expect(tabs.filter((t) => t.tabIndex === 0).length).toBe(1);
    expect(tabs[1].tabIndex).toBe(0);
    expect(tabs[0].tabIndex).toBe(-1);
    expect(tabs[2].tabIndex).toBe(-1);
  });

  it("makes the first tab the stop when nothing is selected", () => {
    const container = document.createElement("div");
    const tabs = makeTabs(container, 3);
    const controller = createRovingTablist(container, { onSelect: () => {} });
    controller.render(tabs, -1);
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    expect(tabs[2].tabIndex).toBe(-1);
  });

  it("moves selection with Arrow/Home/End (clamped) via onSelect", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const tabs = makeTabs(container, 3);
    const picks: number[] = [];
    const controller = createRovingTablist(container, {
      onSelect: (i) => picks.push(i),
    });
    controller.render(tabs, 0);

    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(picks[picks.length - 1]).toBe(1);

    // Clamp at the start: ArrowLeft from index 0 stays put (no onSelect).
    const before = picks.length;
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(picks.length).toBe(before);

    tabs[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(picks[picks.length - 1]).toBe(0);

    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(picks[picks.length - 1]).toBe(2);
  });

  it("uses Up/Down for vertical orientation", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const tabs = makeTabs(container, 3);
    const picks: number[] = [];
    const controller = createRovingTablist(container, {
      onSelect: (i) => picks.push(i),
      orientation: "vertical",
    });
    controller.render(tabs, 1);

    tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(picks[picks.length - 1]).toBe(2);
    tabs[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(picks[picks.length - 1]).toBe(1);
    // Horizontal keys are ignored in vertical mode.
    const before = picks.length;
    tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(picks.length).toBe(before);
  });

  it("restores focus to the selected tab across a rebuild", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const controller = createRovingTablist(container, { onSelect: () => {} });

    const first = makeTabs(container, 3);
    controller.render(first, 0);
    first[0].focus();
    expect(document.activeElement).toBe(first[0]);

    // Rebuild: capture focus, swap the tab DOM, re-render selecting index 1.
    controller.beforeRender();
    container.replaceChildren();
    const next = makeTabs(container, 3);
    controller.render(next, 1);

    expect(document.activeElement).toBe(next[1]);
  });

  it("does not restore focus when beforeRender saw no focus inside the strip", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const controller = createRovingTablist(container, { onSelect: () => {} });

    const first = makeTabs(container, 2);
    controller.render(first, 0);
    // Focus lives outside the strip.
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    controller.beforeRender();
    container.replaceChildren();
    const next = makeTabs(container, 2);
    controller.render(next, 1);

    expect(document.activeElement).toBe(outside);
  });

  it("stops routing keys after destroy", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const tabs = makeTabs(container, 2);
    const picks: number[] = [];
    const controller = createRovingTablist(container, {
      onSelect: (i) => picks.push(i),
    });
    controller.render(tabs, 0);
    controller.destroy();
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(picks.length).toBe(0);
  });
});
