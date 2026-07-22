// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPopover,
  getStyleRoot,
  injectStyles,
  isEditableEventTarget,
} from "./plugin-kit";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("[data-persona-plugin-style]").forEach((n) => n.remove());
  vi.restoreAllMocks();
});

const flushMicrotasks = () => Promise.resolve();

describe("injectStyles / getStyleRoot", () => {
  it("injects a <style> into the document head for a connected light-DOM node", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    injectStyles(el, "kit-light", ".x { color: red; }");

    const style = document.head.querySelector(
      'style[data-persona-plugin-style="kit-light"]'
    );
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("color: red");
  });

  it("is idempotent: repeated calls add only one <style>", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    injectStyles(el, "kit-once", ".a {}");
    injectStyles(el, "kit-once", ".a {}");
    injectStyles(el, "kit-once", ".a {}");

    expect(
      document.head.querySelectorAll('style[data-persona-plugin-style="kit-once"]').length
    ).toBe(1);
  });

  it("injects into the shadow root for a node inside shadow DOM", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const el = document.createElement("div");
    shadow.appendChild(el);

    expect(getStyleRoot(el)).toBe(shadow);

    injectStyles(el, "kit-shadow", ".s {}");

    expect(shadow.querySelector('style[data-persona-plugin-style="kit-shadow"]')).not.toBeNull();
    // Must NOT leak into the document head.
    expect(
      document.head.querySelector('style[data-persona-plugin-style="kit-shadow"]')
    ).toBeNull();
  });

  it("defers shadow injection for a node that mounts after the call", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    // Build detached, inject, then mount into the shadow root (mirrors a plugin
    // returning an element the widget mounts afterward).
    const el = document.createElement("div");
    injectStyles(el, "kit-deferred", ".d {}");
    shadow.appendChild(el);

    await flushMicrotasks();

    expect(shadow.querySelector('style[data-persona-plugin-style="kit-deferred"]')).not.toBeNull();
  });

  it("accepts an explicit Document or ShadowRoot target", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    injectStyles(shadow, "kit-explicit", ".e {}");

    expect(shadow.querySelector('style[data-persona-plugin-style="kit-explicit"]')).not.toBeNull();
  });
});

describe("createPopover", () => {
  const setup = () => {
    const anchor = document.createElement("button");
    anchor.textContent = "anchor";
    document.body.appendChild(anchor);
    const content = document.createElement("div");
    content.textContent = "menu";
    return { anchor, content };
  };

  it("mounts and positions the content on open, removes it on close", () => {
    const { anchor, content } = setup();
    const popover = createPopover({ anchor, content });

    expect(popover.isOpen).toBe(false);
    expect(content.isConnected).toBe(false);

    popover.open();
    expect(popover.isOpen).toBe(true);
    expect(content.isConnected).toBe(true);
    expect(content.style.position).toBe("fixed");
    expect(content.style.top).not.toBe("");
    expect(content.style.left).not.toBe("");

    popover.close();
    expect(popover.isOpen).toBe(false);
    expect(content.isConnected).toBe(false);
  });

  it("toggle flips open/closed", () => {
    const { anchor, content } = setup();
    const popover = createPopover({ anchor, content });

    popover.toggle();
    expect(popover.isOpen).toBe(true);
    popover.toggle();
    expect(popover.isOpen).toBe(false);
  });

  it("closes on outside pointerdown and fires onDismiss", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { anchor, content } = setup();
    const popover = createPopover({ anchor, content, onDismiss });

    popover.open();
    // Arming is deferred via setTimeout so the opening click can't dismiss it.
    vi.runAllTimers();

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(popover.isOpen).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("outside");
    vi.useRealTimers();
  });

  it("does not dismiss when the pointerdown is inside the content", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { anchor, content } = setup();
    const popover = createPopover({ anchor, content, onDismiss });

    popover.open();
    vi.runAllTimers();

    content.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));

    expect(popover.isOpen).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("auto-closes when the anchor leaves the DOM on reposition", () => {
    const onDismiss = vi.fn();
    const { anchor, content } = setup();
    const popover = createPopover({ anchor, content, onDismiss });

    popover.open();
    anchor.remove();
    window.dispatchEvent(new Event("resize"));

    expect(popover.isOpen).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("anchor-removed");
  });

  it("mounts into the anchor's shadow root when shadowed", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const anchor = document.createElement("button");
    shadow.appendChild(anchor);
    const content = document.createElement("div");

    const popover = createPopover({ anchor, content });
    popover.open();

    expect(content.getRootNode()).toBe(shadow);
  });

  it("anchors vertically to a verticalOffset when placement is top-start", () => {
    const { anchor, content } = setup();
    anchor.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 400,
        top: 200,
        bottom: 260,
        width: 300,
        height: 60,
        x: 100,
        y: 200,
        toJSON: () => ({}),
      }) as DOMRect;
    content.getBoundingClientRect = () =>
      ({
        width: 180,
        height: 100,
        left: 0,
        right: 180,
        top: 0,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const popover = createPopover({
      anchor,
      content,
      placement: "top-start",
      offset: 6,
      verticalOffset: () => 40,
    });
    popover.open();

    // anchorTop = 200 + 40 = 240 → top = 240 - 6 - 100 = 134
    expect(content.style.top).toBe("134px");
  });

  it("destroy removes content and detaches listeners", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { anchor, content } = setup();
    const popover = createPopover({ anchor, content, onDismiss });

    popover.open();
    vi.runAllTimers();
    popover.destroy();

    expect(content.isConnected).toBe(false);
    // Listeners are gone, so a later outside pointerdown is a no-op.
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("isEditableEventTarget", () => {
  it("is true for input / textarea / contenteditable targets", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new Event("keydown", { bubbles: true, composed: true });
    input.dispatchEvent(event);
    // jsdom keeps composedPath populated only during dispatch; assert via a
    // synthetic event whose composedPath we can rely on.
    const synthetic = {
      composedPath: () => [input, document.body],
    } as unknown as Event;
    expect(isEditableEventTarget(synthetic)).toBe(true);
  });

  it("is false for a plain button target", () => {
    const button = document.createElement("button");
    const synthetic = {
      composedPath: () => [button, document.body],
    } as unknown as Event;
    expect(isEditableEventTarget(synthetic)).toBe(false);
  });
});
