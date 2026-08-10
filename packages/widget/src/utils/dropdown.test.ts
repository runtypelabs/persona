// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDropdownMenu } from "./dropdown";

describe("createDropdownMenu", () => {
  it("removes the click-outside listener when hidden or destroyed immediately", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const menu = createDropdownMenu({ anchor, items: [], onSelect: vi.fn() });
    menu.show();
    menu.destroy();
    const handler = add.mock.calls.find(([type]) => type === "click")?.[1];
    expect(handler).toBeDefined();
    expect(remove).toHaveBeenCalledWith("click", handler, true);
    add.mockRestore();
    remove.mockRestore();
  });
});
