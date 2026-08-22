// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ariaCombo,
  createShortcutRegistry,
  formatCombo,
  parseCombo,
  setMacPlatformOverride,
} from "./shortcuts";

const press = (
  target: EventTarget,
  key: string,
  init: Record<string, unknown> = {}
): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("parseCombo", () => {
  afterEach(() => setMacPlatformOverride(null));

  it("normalizes modifiers and lowercases the key", () => {
    expect(parseCombo("Mod+B")).toEqual({
      key: "b",
      mod: true,
      shift: false,
      alt: false,
    });
    expect(parseCombo("mod+shift+k")).toEqual({
      key: "k",
      mod: true,
      shift: true,
      alt: false,
    });
    expect(parseCombo("mod+alt+arrowup")).toEqual({
      key: "arrowup",
      mod: true,
      shift: false,
      alt: true,
    });
  });

  it("maps space to the literal key value the event carries", () => {
    expect(parseCombo("mod+space")?.key).toBe(" ");
  });

  it("rejects reserved keys, unknown modifiers, and bare keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseCombo("mod+enter")).toBeNull();
    expect(parseCombo("mod+escape")).toBeNull();
    expect(parseCombo("hyper+b")).toBeNull();
    expect(parseCombo("b")).toBeNull();
    expect(parseCombo("mod+shift+alt+b")).toBeNull();
    expect(parseCombo("")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(6);
  });
});

describe("formatCombo", () => {
  afterEach(() => setMacPlatformOverride(null));

  it("uses symbols with no separator on Apple platforms", () => {
    setMacPlatformOverride(true);
    expect(formatCombo("mod+b")).toBe("⌘B");
    expect(formatCombo("mod+shift+k")).toBe("⇧⌘K");
    expect(formatCombo("mod+alt+b")).toBe("⌥⌘B");
  });

  it("uses named modifiers joined with + elsewhere", () => {
    setMacPlatformOverride(false);
    expect(formatCombo("mod+b")).toBe("Ctrl+B");
    expect(formatCombo("mod+shift+k")).toBe("Ctrl+Shift+K");
    expect(formatCombo("mod+alt+arrowup")).toBe("Ctrl+Alt+ArrowUp");
  });

  it("formats an invalid combo as empty", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(formatCombo("mod+enter")).toBe("");
  });
});

describe("ariaCombo", () => {
  afterEach(() => setMacPlatformOverride(null));

  it("names the platform modifier per the ARIA spec, not the display symbol", () => {
    setMacPlatformOverride(true);
    expect(ariaCombo("mod+b")).toBe("Meta+B");
    expect(ariaCombo("mod+shift+k")).toBe("Meta+Shift+K");
    setMacPlatformOverride(false);
    expect(ariaCombo("mod+b")).toBe("Control+B");
    expect(ariaCombo("mod+alt+b")).toBe("Control+Alt+B");
  });
});

describe("createShortcutRegistry", () => {
  let mount: HTMLElement;
  let outside: HTMLElement;

  beforeEach(() => {
    setMacPlatformOverride(false);
    mount = document.createElement("div");
    outside = document.createElement("div");
    document.body.append(mount, outside);
  });

  afterEach(() => {
    setMacPlatformOverride(null);
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("fires a widget-scoped binding only from inside the mount", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    registry.register({ id: "collapse", combo: "mod+b", run });

    const inside = document.createElement("button");
    mount.appendChild(inside);
    press(inside, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);

    press(outside, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    registry.destroy();
  });

  it("resolves the widget scope through a shadow boundary", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    registry.register({ id: "collapse", combo: "mod+b", run });

    const shadow = mount.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.appendChild(inner);
    press(inner, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    registry.destroy();
  });

  it("fires a page-scoped binding from anywhere", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    registry.register({ id: "collapse", combo: "mod+b", scope: "page", run });

    press(outside, "b", { ctrlKey: true });
    press(document, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(2);
    registry.destroy();
  });

  it("preventDefaults only the keypress it handles", () => {
    const registry = createShortcutRegistry(mount);
    registry.register({ id: "collapse", combo: "mod+b", run: () => {} });
    const inside = document.createElement("button");
    mount.appendChild(inside);

    expect(press(inside, "b", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press(inside, "b").defaultPrevented).toBe(false);
    expect(
      press(inside, "b", { ctrlKey: true, shiftKey: true }).defaultPrevented
    ).toBe(false);
    // The other platform's modifier must be clear.
    expect(
      press(inside, "b", { ctrlKey: true, metaKey: true }).defaultPrevented
    ).toBe(false);
    registry.destroy();
  });

  it("skips text entry unless the binding opts in", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    const allowed = vi.fn();
    registry.register({ id: "collapse", combo: "mod+b", run });
    registry.register({ id: "send", combo: "mod+k", run: allowed, allowInInput: true });

    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    mount.append(input, editable);

    press(input, "b", { ctrlKey: true });
    press(editable, "b", { ctrlKey: true });
    expect(run).not.toHaveBeenCalled();

    press(input, "k", { ctrlKey: true });
    expect(allowed).toHaveBeenCalledTimes(1);
    registry.destroy();
  });

  it("skips a keypress mid-composition", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    registry.register({ id: "collapse", combo: "mod+b", run });
    press(mount, "b", { ctrlKey: true, isComposing: true });
    expect(run).not.toHaveBeenCalled();
    registry.destroy();
  });

  it("honors the when() gate without unregistering", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    let ready = false;
    registry.register({ id: "collapse", combo: "mod+b", run, when: () => ready });

    press(mount, "b", { ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
    ready = true;
    press(mount, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    registry.destroy();
  });

  it("warns once for a duplicate combo and keeps the first binding", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = createShortcutRegistry(mount);
    const first = vi.fn();
    const second = vi.fn();
    registry.register({ id: "first", combo: "mod+b", run: first });
    const unregisterSecond = registry.register({
      id: "second",
      combo: "mod+b",
      run: second,
    });
    expect(warn).toHaveBeenCalledTimes(1);

    press(mount, "b", { ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    // The rejected duplicate must not take the winner's slot down with it.
    unregisterSecond();
    press(mount, "b", { ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(2);
    registry.destroy();
  });

  it("stamps aria-keyshortcuts while a bound element is registered", () => {
    const registry = createShortcutRegistry(mount);
    const button = document.createElement("button");
    mount.appendChild(button);
    const unregister = registry.register({
      id: "collapse",
      combo: "mod+b",
      run: () => {},
      element: button,
    });
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+B");
    unregister();
    expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
    registry.destroy();
  });

  it("stops firing after unregister and after destroy", () => {
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    const unregister = registry.register({ id: "collapse", combo: "mod+b", run });
    press(mount, "b", { ctrlKey: true });
    unregister();
    press(mount, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);

    registry.register({ id: "collapse", combo: "mod+b", run });
    registry.destroy();
    press(mount, "b", { ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ignores a binding whose combo never parsed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = createShortcutRegistry(mount);
    const run = vi.fn();
    registry.register({ id: "bad", combo: "mod+enter", run });
    press(mount, "Enter", { ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
    registry.destroy();
  });
});
