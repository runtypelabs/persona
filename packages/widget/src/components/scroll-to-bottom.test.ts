// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentWidgetConfig, AgentWidgetScrollToBottomIconContext } from "../types";
import { createScrollToBottomControl } from "./scroll-to-bottom";
import { mergeWithDefaults } from "../defaults";
import { mergeConfigUpdate } from "../utils/config-merge";

const icon = vi.fn((name: string) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("data-icon", name);
  return node;
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("scroll-to-bottom chrome", () => {
  it("uses version defaults and preserves explicit options across version changes", () => {
    for (const v5Defaults of [false, true]) {
      const config = mergeWithDefaults({ future: { v5Defaults } });
      expect(config.features?.scrollToBottom?.streamingIndicator).toBe(v5Defaults ? "dots" : "arrow");
      expect(config.features?.scrollToBottom?.transition).toBe(v5Defaults ? "fade" : "none");
    }
    const v4 = mergeWithDefaults({ features: { scrollToBottom: { streamingIndicator: "arrow", transition: "none" } } }) as AgentWidgetConfig;
    expect(mergeConfigUpdate(v4, { future: { v5Defaults: true } }).features?.scrollToBottom).toMatchObject({ streamingIndicator: "arrow", transition: "none" });
    const inherited = mergeWithDefaults({}) as AgentWidgetConfig;
    expect(mergeConfigUpdate(inherited, { future: { v5Defaults: true } }).features?.scrollToBottom).toMatchObject({ streamingIndicator: "dots", transition: "fade" });
  });

  it("shows dots only for visible activity and preserves count, label, and configured idle icon", () => {
    const control = createScrollToBottomControl(icon, "transcript");
    const config: AgentWidgetConfig = { future: { v5Defaults: true }, features: { scrollToBottom: { iconName: "chevron-down", label: "Latest" } } };
    control.update(config, false, true);
    expect(control.element.disabled).toBe(true);
    expect(control.element.querySelector(".persona-scroll-to-bottom-dots")).toBeNull();
    control.update(config, true, true, 2);
    expect(control.element.querySelectorAll(".persona-scroll-to-bottom-dots > span")).toHaveLength(3);
    expect(control.element.getAttribute("aria-label")).toBe("Latest (2 new) (response streaming below)");
    control.update(config, true, false, 2);
    expect(control.element.querySelector("svg")?.getAttribute("data-icon")).toBe("chevron-down");
    expect(control.element.getAttribute("data-persona-scroll-to-bottom-streaming")).toBeNull();
    control.destroy();
  });

  it("names a pending approval below with a labelled shield pill, then reverts", () => {
    const control = createScrollToBottomControl(icon, "transcript");
    const config: AgentWidgetConfig = { future: { v5Defaults: true } };
    control.update(config, true, false, 2, true);
    const el = control.element;
    expect(el.hasAttribute("data-persona-scroll-to-bottom-approval")).toBe(true);
    expect(el.getAttribute("data-persona-scroll-to-bottom-has-label")).toBe("true");
    expect(el.textContent).toBe("Approval needed");
    expect(el.querySelector("svg")?.getAttribute("data-icon")).toBe("shield-check");
    // The label replaces the unread count; assistive tech hears where it leads.
    expect(el.querySelector<HTMLElement>("[data-persona-scroll-to-bottom-count]")?.style.display).toBe("none");
    expect(el.getAttribute("aria-label")).toBe("Approval needed below. Jump to latest");

    // Hidden, the approval state never shows.
    control.update(config, false, false, 0, true);
    expect(el.hasAttribute("data-persona-scroll-to-bottom-approval")).toBe(false);

    control.update(config, true, false, 2, false);
    expect(el.hasAttribute("data-persona-scroll-to-bottom-approval")).toBe(false);
    expect(el.getAttribute("data-persona-scroll-to-bottom-has-label")).toBe("false");
    expect(el.querySelector("svg")?.getAttribute("data-icon")).toBe("arrow-down");
    expect(el.getAttribute("aria-label")).toBe("Jump to latest (2 new)");
    control.destroy();
  });

  it("uses a custom approval label, opts out with an empty one, and tells custom glyphs", () => {
    const states: string[] = [];
    const renderIcon = vi.fn((_context: AgentWidgetScrollToBottomIconContext) => ({
      element: document.createElement("span"),
      update: (next: AgentWidgetScrollToBottomIconContext) => { states.push(next.state.activity); },
    }));
    const control = createScrollToBottomControl(icon, "transcript");
    control.update({ features: { scrollToBottom: { approvalLabel: "Review request", renderIcon } } }, true, false, 0, true);
    expect(control.element.textContent).toBe("Review request");
    expect(renderIcon.mock.calls[0][0].state.activity).toBe("approval-below");
    control.update({ features: { scrollToBottom: { approvalLabel: "", renderIcon } } }, true, false, 1, true);
    expect(control.element.getAttribute("data-persona-scroll-to-bottom-has-label")).toBe("false");
    expect(control.element.getAttribute("aria-label")).toBe("Approval needed below. Jump to latest");
    control.update({ features: { scrollToBottom: { renderIcon } } }, true, false, 0, false);
    expect(states.at(-1)).toBe("idle");
    control.destroy();
  });

  it("makes fading controls inert immediately and returns focus only when owned, including Shadow DOM", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const transcript = document.createElement("div");
    const other = document.createElement("button");
    const control = createScrollToBottomControl(icon, "transcript", transcript);
    root.append(transcript, other, control.element);
    const config: AgentWidgetConfig = { future: { v5Defaults: true } };
    control.update(config, true);
    control.element.focus();
    expect(root.activeElement).toBe(control.element);
    control.update(config, false);
    expect(control.element.style.display).toBe(""); // CSS owns the reversible fade.
    expect(control.element.tabIndex).toBe(-1);
    expect(control.element.disabled).toBe(true);
    expect(control.element.getAttribute("aria-hidden")).toBe("true");
    expect(root.activeElement).toBe(transcript);
    control.update(config, true);
    other.focus();
    control.update(config, false);
    expect(root.activeElement).toBe(other);
    control.destroy();
  });

  it("mounts custom glyphs once, updates only changes, and aborts before cleanup", () => {
    const states: AgentWidgetScrollToBottomIconContext[] = [];
    let signal: AbortSignal;
    const destroy = vi.fn(() => expect(signal.aborted).toBe(true));
    const update = vi.fn((ctx: AgentWidgetScrollToBottomIconContext) => states.push(ctx));
    const render = vi.fn((ctx: AgentWidgetScrollToBottomIconContext) => {
      signal = ctx.signal; states.push(ctx);
      return { element: document.createElement("span"), update, destroy };
    });
    const config: AgentWidgetConfig = { features: { scrollToBottom: { renderIcon: render } } };
    const control = createScrollToBottomControl(icon, "event-stream");
    control.update(config, true);
    const node = control.element.firstChild?.firstChild;
    control.update({ ...config, autoFocusInput: true, features: { scrollToBottom: { ...config.features?.scrollToBottom } } }, true);
    expect(update).not.toHaveBeenCalled();
    control.update(config, true, true, 8);
    control.update(config, true, true, 9);
    expect(update).toHaveBeenCalledTimes(1); // Count is Persona-owned chrome.
    control.element.dispatchEvent(new Event("mouseenter"));
    control.element.dispatchEvent(new Event("focus"));
    expect(states.at(-1)?.state).toMatchObject({ activity: "generating-below", hovered: true, focused: true, visible: true });
    expect(states.at(-1)?.view).toBe("event-stream");
    expect(control.element.firstChild?.firstChild).toBe(node);
    control.update(config, false, true);
    expect(states.at(-1)?.state).toMatchObject({ visible: false, hovered: false, focused: false, activity: "idle" });
    expect(render).toHaveBeenCalledTimes(1);
    control.update({ features: { scrollToBottom: { enabled: false, renderIcon: render } } }, false);
    expect(destroy).toHaveBeenCalledTimes(1);
    control.update(config, false);
    expect(render).toHaveBeenCalledTimes(2);
    control.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("retains plain elements, cleans up replacements, and falls back on null or renderer errors", () => {
    const control = createScrollToBottomControl(icon, "transcript");
    const plain = document.createElement("span");
    let signal: AbortSignal;
    const render = vi.fn((ctx: AgentWidgetScrollToBottomIconContext) => { signal = ctx.signal; return plain; });
    const config: AgentWidgetConfig = { features: { scrollToBottom: { renderIcon: render } } };
    control.update(config, true);
    control.update(config, true, true);
    expect(render).toHaveBeenCalledTimes(1);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    control.update({ features: { scrollToBottom: { renderIcon: () => { throw Error("failed"); } } } }, true);
    expect(signal!.aborted).toBe(true);
    expect(control.element.querySelector("svg")).not.toBeNull();
    control.update({ features: { scrollToBottom: { renderIcon: () => null } } }, true);
    expect(control.element.querySelector("svg")).not.toBeNull();
    const destroy = vi.fn();
    const failing: AgentWidgetConfig = { features: { scrollToBottom: { renderIcon: () => ({ element: plain, update: () => { throw Error("update"); }, destroy }) } } };
    control.update(failing, true);
    control.update(failing, false);
    expect(control.element.querySelector("svg")).not.toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
    control.destroy(); warning.mockRestore();
  });

  describe("approval morph", () => {
    const stubAnimate = () => {
      const calls: { target: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: { cancel: ReturnType<typeof vi.fn> } }[] = [];
      const original = (HTMLElement.prototype as { animate?: unknown }).animate;
      (HTMLElement.prototype as { animate?: unknown }).animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        const animation = { cancel: vi.fn(), finished: new Promise<void>(() => {}) };
        calls.push({ target: this, keyframes, options, animation });
        return animation;
      };
      return { calls, restore: () => { (HTMLElement.prototype as { animate?: unknown }).animate = original; } };
    };

    it("morphs a visible arrow into the pill on the theme's motion tokens, and back", () => {
      const { calls, restore } = stubAnimate();
      try {
        const control = createScrollToBottomControl(icon, "transcript");
        document.body.appendChild(control.element);
        control.element.style.setProperty("--persona-motion-duration-base", "0.3s");
        control.element.style.setProperty("--persona-motion-easing", "cubic-bezier(0.2, 0, 0, 1)");
        const config: AgentWidgetConfig = { future: { v5Defaults: true } };
        control.update(config, true);
        expect(calls).toHaveLength(0);

        control.update(config, true, false, 0, true);
        const [own, labelFade] = calls;
        expect(own.target).toBe(control.element);
        expect(own.keyframes).toHaveLength(2);
        expect(own.keyframes[0]).toMatchObject({ overflow: "hidden" });
        expect(own.keyframes[0]).toHaveProperty("width");
        expect(own.keyframes[1]).toHaveProperty("backgroundColor");
        expect(own.options).toEqual({ duration: 300, easing: "cubic-bezier(0.2, 0, 0, 1)" });
        // The label fades in as the clipped pill widens.
        expect(labelFade.target.textContent).toBe("Approval needed");
        expect(calls).toHaveLength(2);

        // Ordinary syncs in the same state leave a running morph alone.
        control.update(config, true, false, 0, true);
        expect(calls).toHaveLength(2);
        expect(calls.every((call) => call.animation.cancel.mock.calls.length === 0)).toBe(true);

        // Back to the arrow: the running morph is replaced, unclipped (the
        // count badge hangs outside the button).
        control.update(config, true, false, 2, false);
        expect(calls.slice(0, 2).every((call) => call.animation.cancel.mock.calls.length === 1)).toBe(true);
        expect(calls).toHaveLength(3);
        expect(calls[2].keyframes[0]).not.toHaveProperty("overflow");
        control.destroy();
      } finally { restore(); }
    });

    it("swaps instantly when the theme turns motion off, and falls back when the duration is missing", () => {
      const { calls, restore } = stubAnimate();
      try {
        const config: AgentWidgetConfig = { future: { v5Defaults: true } };
        const off = createScrollToBottomControl(icon, "transcript");
        off.element.style.setProperty("--persona-motion-duration-base", "0ms");
        off.update(config, true);
        off.update(config, true, false, 0, true);
        expect(calls).toHaveLength(0);
        expect(off.element.hasAttribute("data-persona-scroll-to-bottom-approval")).toBe(true);
        off.destroy();

        const unset = createScrollToBottomControl(icon, "transcript");
        unset.update(config, true);
        unset.update(config, true, false, 0, true);
        expect(calls[0].options.duration).toBe(200);
        unset.destroy();
      } finally { restore(); }
    });

    it("does not morph a control that appears, hides, or prefers reduced motion", () => {
      const { calls, restore } = stubAnimate();
      try {
        const config: AgentWidgetConfig = { future: { v5Defaults: true } };
        const control = createScrollToBottomControl(icon, "transcript");
        control.update(config, false);
        control.update(config, true, false, 0, true); // appears already as the pill
        control.update(config, false, false, 0, true); // hides
        expect(calls).toHaveLength(0);
        control.destroy();

        vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
        const reduced = createScrollToBottomControl(icon, "transcript");
        reduced.update(config, true);
        reduced.update(config, true, false, 0, true);
        expect(calls).toHaveLength(0);
        expect(reduced.element.hasAttribute("data-persona-scroll-to-bottom-approval")).toBe(true);
        reduced.destroy();
      } finally { restore(); }
    });
  });

  it("provides live reduced-motion changes and releases its media listener", () => {
    let change: (() => void) | undefined;
    const media = { matches: true, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", () => media);
    const update = vi.fn();
    const render = vi.fn((ctx: AgentWidgetScrollToBottomIconContext) => { expect(ctx.state.reducedMotion).toBe(true); return { element: document.createElement("span"), update }; });
    const control = createScrollToBottomControl(icon, "transcript");
    control.update({ features: { scrollToBottom: { renderIcon: render } } }, true, true);
    media.matches = false; change?.();
    expect(update.mock.calls[0][0].state.reducedMotion).toBe(false);
    control.destroy();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", change);
  });
});
