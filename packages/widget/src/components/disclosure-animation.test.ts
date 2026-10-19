// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { mergeWithDefaults } from "../defaults";
import { morphMessages } from "../utils/morph";
import { createToolBubble, updateToolBubbleUI } from "./tool-bubble";
import { createReasoningBubble, updateReasoningBubbleUI } from "./reasoning-bubble";
import { createActivityGroup, createActivityLifecycle } from "./activity-row";
import { createDisclosureLifecycle, disclosureSettings } from "./disclosure-animation";

const message: AgentWidgetMessage = { id: "tool", role: "assistant", content: "", createdAt: "2026-01-01", variant: "tool", toolCall: { id: "tool", name: "Search", status: "running", chunks: ["Details"] } };
const height: AgentWidgetConfig = { expansion: { animation: "height" } };
type Effect = { frames: Keyframe[]; options: KeyframeAnimationOptions; onfinish: (() => void) | null; oncancel: (() => void) | null; cancel: ReturnType<typeof vi.fn>; currentHeight: number; cancelled: boolean; effect: { getComputedTiming: () => { progress: number }; setKeyframes: ReturnType<typeof vi.fn> } };
let effects: Effect[];
let contentEffects: Effect[];
let elements: WeakMap<HTMLElement, Effect>;
let naturalSizes: WeakMap<HTMLElement, number>;
let observers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[];
let motion: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
const body = (bubble: HTMLElement) => bubble.querySelector<HTMLElement>(".persona-border-t")!;
const header = (bubble: HTMLElement) => bubble.querySelector<HTMLButtonElement>("button")!;
beforeEach(() => {
  effects = []; contentEffects = []; elements = new WeakMap(); naturalSizes = new WeakMap(); observers = [];
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn(); disconnect = vi.fn(); callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
  });
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => motion);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const effect = elements.get(this);
    const preview = this.querySelector<HTMLElement>("[data-persona-collapsed-preview]");
    const measured = this.style.getPropertyValue("height") === "auto" && naturalSizes.has(this) ? naturalSizes.get(this)! : effect && !effect.cancelled && this.style.getPropertyPriority("height") !== "important" ? effect.currentHeight
      : 40 + (body(this)?.style.display !== "none" && body(this) ? 160 : preview && preview.style.display !== "none" ? 35 : 0);
    return { height: measured } as DOMRect;
  });
  vi.stubGlobal("Animation", class {});
  if (!HTMLElement.prototype.animate) Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(function(this: HTMLElement, frames, options) {
    const effect: Effect = { frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, onfinish: null, oncancel: null, currentHeight: Number.parseFloat((frames as Keyframe[])[0].height as string), cancelled: false, cancel: vi.fn(), effect: { getComputedTiming: () => ({ progress: 0.6 }), setKeyframes: vi.fn() } };
    effect.cancel.mockImplementation(() => { effect.cancelled = true; effect.oncancel?.(); });
    (this.hasAttribute("data-persona-disclosure") ? effects : contentEffects).push(effect); elements.set(this, effect);
    return effect as unknown as Animation;
  });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function harness(config: AgentWidgetConfig = height) {
  const root = document.createElement("div"); document.body.append(root);
  let cfg = config;
  const state = new Set<string>();
  const lifecycle = createDisclosureLifecycle(root, () => cfg);
  const render = (msg = message) => {
    const next = document.createElement("div"); next.append(createToolBubble(msg, cfg, state));
    lifecycle.prepare(next); morphMessages(root, next); lifecycle.sync();
    return root.querySelector<HTMLElement>("[data-persona-disclosure]")!;
  };
  const bubble = render();
  return { root, state, lifecycle, render, bubble, config: (next: AgentWidgetConfig) => { cfg = next; }, toggle: (expanded: boolean) => {
    if (expanded) state.add(message.id); else state.delete(message.id);
    updateToolBubbleUI(message.id, bubble, state, cfg);
  } };
}

it("keeps V4 instant and normalizes invalid durations", () => {
  expect(disclosureSettings()).toEqual({ animation: "instant", duration: 160, easing: "ease-out" });
  expect(disclosureSettings({ expansion: { duration: -20 } }).duration).toBe(0);
  expect(disclosureSettings({ expansion: { duration: NaN } }).duration).toBe(160);
  const h = harness({}); h.toggle(true); h.toggle(false);
  expect(effects).toHaveLength(0); expect(body(h.bubble).style.display).toBe("none");
  expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled();
  h.lifecycle.destroy();
});

it("shares V5 motion defaults between standalone and merged builders, respecting instant overrides", () => {
  const future = { v5Defaults: true };
  const cases: AgentWidgetConfig[] = [
    { future },
    { future, expansion: { chevron: { collapsed: "left" } } },
    mergeWithDefaults({ future }) as AgentWidgetConfig,
    mergeWithDefaults({ future, expansion: { duration: 160 } }) as AgentWidgetConfig,
  ];
  for (const config of cases) {
    expect(disclosureSettings(config)).toEqual({ animation: "height", duration: 160, easing: "ease-out" });
    const group = createActivityGroup({ ...message, id: "group" }, config, false, "Two tools");
    expect(group.bubble.dataset.personaDisclosureMotion).toBe("height");
    const count = effects.length;
    const h = harness(config);
    expect(effects).toHaveLength(count); // Initial state never animates.
    h.toggle(true);
    expect(effects).toHaveLength(count + 1);
    expect(effects[count].options).toMatchObject({ duration: 160, easing: "ease-out" });
    h.lifecycle.destroy();
  }
  effects.length = 0;
  for (const config of [{ future, expansion: { animation: "instant" as const } }, mergeWithDefaults({ future, expansion: { animation: "instant" } }) as AgentWidgetConfig]) {
    const group = createActivityGroup({ ...message, id: "group" }, config, false, "Two tools");
    expect(group.bubble.dataset.personaDisclosureMotion).toBeUndefined();
    const h = harness(config); h.toggle(true); h.toggle(false);
    expect(effects).toHaveLength(0);
    h.lifecycle.destroy();
  }
  motion.matches = true;
  const h = harness({ future }); h.toggle(true);
  expect(effects).toHaveLength(0);
  h.lifecycle.destroy();
});

it("opens and reverses from rendered height, preserving header and host inline styling", () => {
  const h = harness();
  h.bubble.style.overflow = "clip";
  const originalHeader = header(h.bubble);
  h.toggle(true);
  expect(effects[0].frames.map(frame => frame.height)).toEqual(["40px", "200px"]);
  expect(effects[0].options).toMatchObject({ duration: 160, easing: "ease-out" });
  effects[0].currentHeight = 112;
  const focusable = document.createElement("button"); body(h.bubble).append(focusable); focusable.focus();
  h.toggle(false);
  expect(effects[0].cancel).toHaveBeenCalledOnce();
  expect(effects[1].frames.map(frame => frame.height)).toEqual(["112px", "40px"]);
  expect(body(h.bubble).style.display).toBe(""); expect(body(h.bubble).inert).toBe(true);
  expect(document.activeElement).toBe(originalHeader);
  effects[1].onfinish?.();
  expect(body(h.bubble).style.display).toBe("none");
  expect(h.bubble.style.height).toBe(""); expect(h.bubble.style.overflow).toBe("clip");
  expect(header(h.bubble)).toBe(originalHeader);
  h.lifecycle.destroy();
});

it("measures collapsed previews and retains closing content until the handoff", () => {
  const h = harness({ ...height, features: { toolCallDisplay: { activePreview: true } } });
  h.toggle(true); expect(effects[0].frames[0].height).toBe("75px"); effects[0].onfinish?.();
  h.toggle(false); expect(effects[1].frames[1].height).toBe("75px");
  const preview = h.bubble.querySelector<HTMLElement>("[data-persona-collapsed-preview]")!;
  expect(preview.style.display).toBe("none");
  effects[1].onfinish?.(); expect(preview.style.display).toBe("");
  h.lifecycle.destroy();
});

it("keeps effects and body updates through streaming morphs, then allows natural growth", () => {
  const h = harness(); h.toggle(true);
  const first = effects[0]; first.currentHeight = 100;
  expect(h.render({ ...message, toolCall: { ...message.toolCall!, chunks: ["Streamed update"] } })).toBe(h.bubble);
  expect(body(h.bubble).textContent).toContain("Streamed update");
  expect(effects).toHaveLength(1); expect(first.cancel).not.toHaveBeenCalled();
  first.onfinish?.(); h.render({ ...message, toolCall: { ...message.toolCall!, chunks: ["More normal growth"] } });
  expect(effects).toHaveLength(1); expect(h.bubble.style.height).toBe("");
  h.toggle(false); const closing = effects[1]; closing.currentHeight = 120;
  h.render(); expect(closing.cancel).not.toHaveBeenCalled(); expect(body(h.bubble).style.display).toBe("");
  closing.onfinish?.(); expect(body(h.bubble).style.display).toBe("none");
  h.lifecycle.destroy();
});

it("animates existing auto-expanded state, but renders initial/restored expanded state immediately", () => {
  const h = harness(); h.state.add(message.id); h.render();
  expect(effects).toHaveLength(1); expect(effects[0].frames[0].height).toBe("40px");
  effects[0].onfinish?.(); h.state.delete(message.id); h.render();
  expect(effects).toHaveLength(2); expect(effects[1].frames[1].height).toBe("40px");
  h.lifecycle.destroy();
  const initial = createToolBubble(message, height, new Set([message.id]));
  const next = document.createElement("div"); next.append(initial);
  const lifecycle = createDisclosureLifecycle(h.root, () => height);
  h.root.replaceChildren(); lifecycle.prepare(next); morphMessages(h.root, next); lifecycle.sync();
  expect(effects).toHaveLength(2); expect(body(h.root.firstElementChild as HTMLElement).style.display).toBe("");
  lifecycle.destroy();
});

it("settles settings updates, removals, clear, destruction, and reduced motion changes", () => {
  const h = harness(); h.toggle(true); h.config({ expansion: { animation: "height", duration: 600 } }); h.render();
  expect(effects[0].cancel).toHaveBeenCalledOnce(); expect(body(h.bubble).style.display).toBe("");
  h.toggle(false); h.bubble.remove(); h.lifecycle.sync(); expect(effects[1].cancel).toHaveBeenCalledOnce();
  h.root.append(h.bubble); h.toggle(true); h.lifecycle.clear(); expect(effects[2].cancel).toHaveBeenCalledOnce();
  h.toggle(false); h.lifecycle.sync(); motion.matches = true;
  motion.addEventListener.mock.calls[0][1](); expect(effects[3].cancel).toHaveBeenCalledOnce();
  h.toggle(true); expect(effects).toHaveLength(4);
  h.lifecycle.destroy(); expect(motion.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
});

it("settles nested parent motion before opening child details", () => {
  const group = createActivityGroup({ ...message, id: "group" }, height, false, "Two tools");
  const child = createToolBubble(message, height); group.body.append(child); document.body.append(group.bubble);
  const state = new Set(["group"]); updateToolBubbleUI("group", group.bubble, state, height);
  expect(effects).toHaveLength(1);
  updateToolBubbleUI(message.id, child, new Set([message.id]), height);
  expect(effects[0].cancel).toHaveBeenCalledOnce(); expect(effects).toHaveLength(2);
  effects[1].onfinish?.();
});

it("falls back to instant for reduced motion, zero duration, and invalid easing", () => {
  const h = harness(); motion.matches = true; h.toggle(true); expect(effects).toHaveLength(0);
  motion.matches = false; h.config({ expansion: { animation: "height", duration: 0 } }); h.toggle(false); expect(effects).toHaveLength(0);
  h.config(height); vi.mocked(h.bubble.animate).mockImplementationOnce(() => { throw new TypeError("Invalid easing"); });
  h.toggle(true); expect(body(h.bubble).style.display).toBe(""); expect(h.bubble.style.height).toBe("");
  h.lifecycle.destroy();
});

it.each(["card", "row"] as const)("shares motion with reasoning and custom content in standard %s containers", variant => {
  const reason: AgentWidgetMessage = { ...message, id: "reason", variant: "reasoning", toolCall: undefined, reasoning: { id: "reason", status: "streaming", chunks: ["Reasoning"] } };
  const cfg: AgentWidgetConfig = { ...height, features: { reasoningDisplay: { variant }, toolCallDisplay: { variant } } };
  const tool = createToolBubble(message, cfg);
  const custom = document.createElement("div"); custom.textContent = "Custom details"; body(tool).append(custom);
  const reasoning = createReasoningBubble(reason, cfg);
  document.body.append(tool, reasoning);
  updateToolBubbleUI(message.id, tool, new Set([message.id]), cfg);
  updateReasoningBubbleUI(reason.id, reasoning, new Set([reason.id]), cfg);
  expect(effects).toHaveLength(2); expect(tool.textContent).toContain("Custom details");
  effects.forEach(effect => effect.onfinish?.());
});

it("uses the same height transition for delayed automatic collapse", () => {
  vi.useFakeTimers(); const h = harness(); h.toggle(true); effects[0].onfinish?.();
  const lifecycle = createActivityLifecycle(id => updateToolBubbleUI(id, h.bubble, h.state, height));
  lifecycle.observe(message, "tool", h.state);
  lifecycle.observe({ ...message, toolCall: { ...message.toolCall!, status: "complete" } }, "tool", h.state, { autoCollapseDelay: 50 });
  vi.advanceTimersByTime(50); expect(effects).toHaveLength(2); expect(header(h.bubble).getAttribute("aria-expanded")).toBe("false");
  lifecycle.destroy(); h.lifecycle.destroy();
});

it("retargets streaming growth without restarting or changing current height/elapsed progress", () => {
  const h = harness(); h.toggle(true); const effect = effects[0];
  effect.currentHeight = 110; naturalSizes.set(h.bubble, 280);
  observers[0].callback();
  expect(effects).toHaveLength(1); expect(effect.cancel).not.toHaveBeenCalled();
  expect(effect.effect.setKeyframes).toHaveBeenCalledWith([
    expect.objectContaining({ height: "110px", offset: 0.6 }),
    expect.objectContaining({ height: "280px", offset: 1 }),
  ]);
  expect(h.bubble.style.height).toBe("");
  h.bubble.style.setProperty("height", "250px", "important");
  naturalSizes.set(h.bubble, 300); observers[0].callback();
  expect(h.bubble.style.getPropertyValue("height")).toBe("250px");
  expect(h.bubble.style.getPropertyPriority("height")).toBe("important");
  effect.onfinish?.(); expect(observers[0].disconnect).toHaveBeenCalledOnce();
  h.lifecycle.destroy();
});

it("returns focus from Shadow DOM details to their header without scrolling", () => {
  const host = document.createElement("div"); document.body.append(host); const shadow = host.attachShadow({ mode: "open" });
  const bubble = createToolBubble(message, height, new Set([message.id])); shadow.append(bubble);
  const control = document.createElement("button"); body(bubble).append(control); control.focus();
  expect(document.activeElement).toBe(host); expect(shadow.activeElement).toBe(control);
  const focus = vi.spyOn(header(bubble), "focus");
  updateToolBubbleUI(message.id, bubble, new Set(), height);
  expect(shadow.activeElement).toBe(header(bubble)); expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  effects[0].onfinish?.();
});

it("keeps a nested tool preview owned by that tool when the group opens/closes", () => {
  const cfg: AgentWidgetConfig = { ...height, features: { toolCallDisplay: { activePreview: true } } };
  const group = createActivityGroup({ ...message, id: "group" }, cfg, false, "Two tools");
  const child = createToolBubble(message, cfg); group.body.append(child); document.body.append(group.bubble);
  const preview = child.querySelector<HTMLElement>("[data-persona-collapsed-preview]")!;
  expect(preview.style.display).toBe("");
  updateToolBubbleUI("group", group.bubble, new Set(["group"]), cfg);
  expect(preview.style.display).toBe(""); effects[0].onfinish?.();
  updateToolBubbleUI("group", group.bubble, new Set(), cfg);
  expect(preview.style.display).toBe(""); effects[1].onfinish?.();
  expect(preview.style.display).toBe(""); expect(body(child).style.display).toBe("none");
});

it("supports matchMedia implementations without event listeners", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const h = harness({}); expect(() => h.lifecycle.destroy()).not.toThrow();
});

it("avoids invalid keyframe offsets during a custom easing's negative overshoot", () => {
  const h = harness(); h.toggle(true); const effect = effects[0];
  effect.effect.getComputedTiming = () => ({ progress: -0.1 });
  naturalSizes.set(h.bubble, 280); observers[0].callback();
  expect(effect.effect.setKeyframes).not.toHaveBeenCalled();
  h.lifecycle.destroy();
});


it("moves/fades only the content and reverses from its current visual state", () => {
  const h = harness();
  body(h.bubble).style.transform = "translateX(2px)";
  h.toggle(true);
  expect(contentEffects[0].frames).toEqual([
    { transform: "translateX(2px) translateY(-8px)", opacity: "0" },
    { transform: "translateX(2px)", opacity: "1" },
  ]);
  effects[0].currentHeight = 112;
  const nativeStyle = getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation(el => el === body(h.bubble) && !contentEffects[0].cancelled
    ? { transform: "matrix(1, 0, 0, 1, 2, -2)", opacity: "0.5" } as CSSStyleDeclaration : nativeStyle(el));
  h.toggle(false);
  expect(contentEffects[0].cancel).toHaveBeenCalledOnce();
  expect(contentEffects[1].frames[0]).toEqual({ transform: "matrix(1, 0, 0, 1, 2, -2)", opacity: "0.5" });
  expect(contentEffects[1].frames[1]).toEqual({ transform: "translateX(2px) translateY(-8px)", opacity: "0" });
  effects[1].onfinish?.();
  expect(contentEffects[1].cancel).toHaveBeenCalledOnce();
  expect(body(h.bubble).style.transform).toBe("translateX(2px)");
  expect(body(h.bubble).style.opacity).toBe("");
  h.lifecycle.destroy();
});

it("keeps the content effect through morphs and cancels it on reduced motion", () => {
  const h = harness(); h.toggle(true); h.render();
  expect(contentEffects).toHaveLength(1);
  expect(contentEffects[0].cancel).not.toHaveBeenCalled();
  motion.matches = true; motion.addEventListener.mock.calls[0][1]();
  expect(contentEffects[0].cancel).toHaveBeenCalledOnce();
  h.lifecycle.destroy();
});

it.each([
  [{}, "rotate(90deg)", "rotate(-90deg)"],
  [{ future: { v5Defaults: true } }, "rotate(0deg)", "rotate(90deg)"],
  [{ expansion: { chevron: { collapsed: "left", expanded: "right" } } }, "rotate(180deg)", "rotate(0deg)"],
] as const)("resolves disclosure directions on initial rendering and toggles: %j", (config, closed, open) => {
  const cfg = config as AgentWidgetConfig;
  const arrow = (bubble: HTMLElement) => bubble.querySelector<HTMLElement>(".persona-disclosure-chevron")?.style.transform;
  const h = harness(cfg);
  expect(arrow(h.bubble)).toBe(closed); h.toggle(true); expect(arrow(h.bubble)).toBe(open);
  h.toggle(false); expect(arrow(h.bubble)).toBe(closed);
  const group = createActivityGroup({ ...message, id: "group" }, cfg, false, "Two tools");
  expect(arrow(group.bubble)).toBe(closed);
  updateToolBubbleUI("group", group.bubble, new Set(["group"]), cfg);
  expect(arrow(group.bubble)).toBe(open);
  const reason: AgentWidgetMessage = { ...message, id: "reason", variant: "reasoning", toolCall: undefined, reasoning: { id: "reason", status: "complete", chunks: ["Details"] } };
  const reasoning = createReasoningBubble(reason, cfg);
  expect(arrow(reasoning)).toBe(closed);
  updateReasoningBubbleUI("reason", reasoning, new Set(["reason"]), cfg);
  expect(arrow(reasoning)).toBe(open);
  h.config({ expansion: { chevron: { collapsed: "up" } } }); h.render();
  expect(arrow(h.bubble)).toBe("rotate(-90deg)");
  h.lifecycle.destroy();
});


it("preserves the lighter chevron through toggles and morphs with shared motion settings", () => {
  const h = harness({ expansion: { animation: "height", duration: 300, easing: "linear" } });
  const arrow = h.bubble.querySelector<HTMLElement>(".persona-disclosure-chevron")!;
  const glyph = arrow.querySelector("svg");
  expect(glyph?.getAttribute("stroke-width")).toBe("1.5");
  expect(arrow.style.transitionDuration).toBe("300ms");
  expect(arrow.style.transitionTimingFunction).toBe("linear");
  h.toggle(true); h.render();
  expect(h.bubble.querySelector(".persona-disclosure-chevron svg")).toBe(glyph);
  h.toggle(false);
  expect(arrow.querySelector("svg")).toBe(glyph);
  h.config({ expansion: { animation: "instant" } }); h.render();
  expect(arrow.style.transitionDuration).toBe("0ms");
  h.lifecycle.destroy();
});
