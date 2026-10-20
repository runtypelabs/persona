// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { buildComposer } from "../components/composer-builder";
import { buildPillComposer } from "../components/pill-composer-builder";

afterEach(() => { document.body.innerHTML = ""; });

describe.each([buildComposer, buildPillComposer])("composer background focus", (build) => {
  it("preserves focus on interactive slot controls and their nested icons", () => {
    const elements = build({ config: { apiUrl: "/chat" } });
    document.body.append(elements.footer);
    const slot = document.createElement("div");
    elements.composerForm.append(slot);
    for (const tag of ["button", "input", "select", "a"] as const) {
      const control = document.createElement(tag);
      if (tag === "a") control.setAttribute("href", "#host");
      if (tag === "button") control.setAttribute("type", "button");
      const nested = document.createElement("span");
      control.append(nested);
      slot.append(control);
      control.focus();
      nested.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(document.activeElement).toBe(control);
    }
  });

  it("focuses the current inline editor after a textarea swap", () => {
    const elements = build({ config: { apiUrl: "/chat" } });
    document.body.append(elements.footer);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("data-persona-composer-input", "");
    editor.tabIndex = 0;
    elements.textarea.replaceWith(editor);
    elements.composerForm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(editor);
    expect(elements.textarea.isConnected).toBe(false);
  });

  it("focuses the textarea from empty chrome but preserves an editable host slot", () => {
    const elements = build({ config: { apiUrl: "/chat" } });
    document.body.append(elements.footer);
    elements.composerForm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(elements.textarea);
    const hostEditor = document.createElement("div");
    hostEditor.setAttribute("contenteditable", "true");
    hostEditor.tabIndex = 0;
    elements.leftActions.append(hostEditor);
    hostEditor.focus();
    hostEditor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(hostEditor);
  });
});

// These host slots bubble through the actual widget form, unlike contributed
// action buttons that stop propagation themselves.
describe("interactive composer slots", () => {
  it("preserves a host input's focus in both versions", async () => {
    const { createAgentExperience } = await import("../ui");
    for (const v5Defaults of [false, true]) {
      const mount = document.createElement("div");
      document.body.append(mount);
      const hostInput = document.createElement("input");
      const controller = createAgentExperience(mount, {
        apiUrl: "/chat", persistState: false, launcher: { enabled: false },
        future: { v5Defaults }, layout: { slots: { "composer-start": () => hostInput } },
      });
      try {
        expect(hostInput.isConnected).toBe(true);
        hostInput.focus();
        hostInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(document.activeElement).toBe(hostInput);
      } finally { controller.destroy(); }
    }
  });
});
