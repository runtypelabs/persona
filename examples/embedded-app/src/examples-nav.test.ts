// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderExamplesShell } from "./examples-nav";

describe("examples command palette", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("opens with Cmd+K, filters examples, and activates the highlighted result", () => {
    const selected: string[] = [];
    renderExamplesShell("agent-demo", {
      onCommandSelect: (href) => selected.push(href),
    });

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );

    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.hidden).toBe(false);
    expect(document.activeElement).toBe(dialog?.querySelector("input"));

    const input = dialog?.querySelector<HTMLInputElement>("input");
    input!.value = "approval";
    input!.dispatchEvent(new Event("input", { bubbles: true }));

    const visibleItems = Array.from(
      dialog!.querySelectorAll<HTMLAnchorElement>("[data-command-palette-item]"),
    ).filter((item) => !item.hidden);
    expect(visibleItems[0]?.textContent).toContain("Tool Approval");
    expect(visibleItems[0]?.querySelector(".persona-command-palette-item-icon")).toBeNull();

    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(selected).toEqual(["/approval-demo.html"]);
    expect(dialog?.hidden).toBe(true);
  });
});
