import * as sharedIcons from "../utils/icons";
import * as sharedTooltips from "../utils/tooltip";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerAction, ComposerActionOverflowConfig, ComposerButtonAction, ComposerState } from "../types";
import { bindComposerSurface } from "./composer-bindings";
import { buildComposer } from "./composer-builder";
import { createComposerActionRenderer } from "./composer-actions";

const state: ComposerState = { text: "", attachments: [], mentionRefs: [], activeModeIds: [], phase: "idle", inputDisabled: false, sendDisabled: false };
const renderers: ReturnType<typeof createComposerActionRenderer>[] = [];
const sizes = new Map<string, number>();
const action = (id: string, order: number, presentation: "auto" | "bar" | "overflow" = "auto"): ComposerButtonAction =>
  ({ id, order, presentation, placement: "start", label: id, onSelect: () => {} });

function mount(actions: ComposerAction[], options: ComposerActionOverflowConfig = { enabled: true, collapseAutoActions: "fit" }, compact = true) {
  const config = { apiUrl: "/api", launcher: { enabled: false } };
  const elements = buildComposer({ config });
  document.body.append(elements.footer);
  const bindings = bindComposerSurface(elements.footer)!;
  let width = 420;
  Object.defineProperty(bindings.form, "clientWidth", { get: () => width });
  bindings.form.style.cssText = "padding:8px;gap:8px;--persona-composer-control-size:40px";
  bindings.actionsStart.style.gap = "8px";
  bindings.actionsEnd.style.gap = "8px";
  if (compact) {
    bindings.footer.setAttribute("data-persona-composer-layout", "single-row");
    bindings.footer.setAttribute("data-persona-composer-compact", "");
  }
  const renderer = createComposerActionRenderer({ deps: { renderLucideIcon: sharedIcons.renderLucideIcon, attachTooltip: sharedTooltips.attachTooltip, hideTooltipFor: sharedTooltips.hideTooltipFor }, getBindings: () => bindings,
    collect: () => ({ builtIns: [{ id: "core:send", placement: "end", order: 1000, element: elements.sendButtonWrapper }],
      configActions: actions, plugins: [], contributionContext: { config, getState: () => state, requestRender: () => {} } }),
    getState: () => state, getOverflow: () => options,
    actionContext: { getState: () => state, getValue: () => "", setValue: () => {}, submit: () => {}, openAttachmentPicker: () => {}, toggleVoice: () => {}, requestRender: () => {} },
    reportError: (error) => { throw error; },
  });
  renderers.push(renderer);
  renderer.resolve();
  return { renderer, bindings, elements, actions, resize: (next: number) => { width = next; renderer.sync(); } };
}
const folded = (harness: ReturnType<typeof mount>) => Array.from(harness.renderer.getOverflowMenu()?.panel.querySelectorAll("[data-persona-composer-action]") ?? [])
  .map((node) => node.getAttribute("data-persona-composer-action"));

describe("measured composer action overflow", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const id = this.closest("[data-persona-composer-action]")?.getAttribute("data-persona-composer-action");
      const slot = this.getAttribute("data-slot-width");
      const width = slot ? Number(slot) : id ? sizes.get(id) ?? 80 : this.matches("[data-persona-composer-submit], [data-persona-composer-overflow-trigger]") ||
        this.querySelector("[data-persona-composer-submit], [data-persona-composer-overflow-trigger]") ? 40 : 0;
      return { width, height: 40, x: 0, y: 0, top: 0, left: 0, bottom: 40, right: width, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => { renderers.splice(0).forEach((renderer) => renderer.destroy()); document.body.replaceChildren(); sizes.clear(); vi.restoreAllMocks(); });

  it("folds by measured priority, reserves input and pinned controls, and recovers without oscillation", () => {
    const harness = mount([action("early", 100), action("late", 200), action("pinned", 900, "bar")]);
    harness.resize(380);
    expect(folded(harness)).toEqual(["late"]);
    expect(harness.bindings.actionsStart.querySelector('[data-persona-composer-action="pinned"]')).toBeTruthy();
    expect(harness.elements.sendButton.isConnected).toBe(true);
    harness.resize(300);
    expect(folded(harness)).toEqual(["early", "late"]);
    harness.resize(420);
    expect(folded(harness)).toEqual(["late"]);
    harness.resize(480);
    expect(folded(harness)).toEqual([]);
    harness.renderer.sync();
    expect(folded(harness)).toEqual([]);
  });

  it("uses the full stacked toolbar and counts custom slots without moving them into the menu", () => {
    const harness = mount([action("early", 100), action("late", 200)], undefined, false);
    harness.resize(280);
    expect(folded(harness)).toEqual([]);
    const slot = document.createElement("input");
    slot.setAttribute("data-slot-width", "140");
    harness.bindings.actionsEnd.prepend(slot);
    harness.renderer.sync();
    expect(folded(harness)).toEqual(["early", "late"]);
    expect(slot.parentElement).toBe(harness.bindings.actionsEnd);
  });

  it("preserves legacy defaults and explicit menu intent, while fit takes precedence over a breakpoint", () => {
    const legacy = mount([action("auto", 100)], { enabled: true });
    legacy.resize(100);
    expect(folded(legacy)).toEqual([]);
    const fit = mount([action("auto", 100), action("menu", 200, "overflow")], { enabled: true, collapseAutoActions: "fit", collapseAutoActionsBelow: 2000 });
    fit.resize(600);
    expect(folded(fit)).toEqual(["menu"]);
    fit.resize(0);
    expect(folded(fit)).toEqual(["menu"]);
  });

  it("moves keyboard focus to the closed trigger when folding and back to the same button when unfolding", () => {
    const harness = mount([action("early", 100), action("late", 200)]);
    const button = harness.bindings.actionsStart.querySelector<HTMLButtonElement>('[data-persona-composer-action="late"] button')!;
    button.focus();
    harness.renderer.sync();
    expect(document.activeElement).toBe(button);
    harness.resize(300);
    const menu = harness.renderer.getOverflowMenu()!;
    expect(document.activeElement).toBe(menu.triggerButton);
    expect(menu.isOpen()).toBe(false);
    menu.open();
    expect(document.activeElement).toBe(button);
    harness.resize(480);
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(button.parentElement?.parentElement).toBe(harness.bindings.actionsStart);
  });

  it("refreshes folded labels using bar measurements and keeps separate instances independent", () => {
    const actions = [action("early", 100), action("late", 200)];
    const harness = mount(actions);
    const sibling = mount([action("sibling", 100)]);
    harness.resize(300);
    expect(folded(harness)).toEqual(["late"]);
    sizes.set("late", 160);
    actions[1] = { ...actions[1], shortLabel: "A much longer selected mode" };
    harness.renderer.resolve();
    harness.resize(420);
    expect(folded(harness)).toEqual(["late"]);
    harness.resize(540);
    expect(folded(harness)).toEqual([]);
    expect(folded(sibling)).toEqual([]);
  });

  it("restores focus to the selected action when the last menu item becomes pinned", () => {
    const selected = action("mode", 100);
    let harness: ReturnType<typeof mount>;
    selected.onSelect = () => { selected.presentation = "bar"; harness.renderer.resolve(); };
    harness = mount([selected]);
    harness.resize(250);
    const menu = harness.renderer.getOverflowMenu()!;
    menu.open();
    const button = menu.panel.querySelector<HTMLButtonElement>('[data-persona-composer-action="mode"]')!;
    button.click();
    expect(menu.trigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(button.parentElement?.parentElement).toBe(harness.bindings.actionsStart);
  });

  it("preserves a live custom registry control and its value without rendering copies", () => {
    const input = document.createElement("input");
    input.value = "live draft";
    const render = vi.fn(() => ({ element: input }));
    const harness = mount([{ id: "custom", label: "Custom", kind: "custom", placement: "start", presentation: "auto", render }]);
    harness.resize(250);
    expect(folded(harness)).toEqual(["custom"]);
    expect(harness.renderer.getOverflowMenu()!.panel.contains(input)).toBe(true);
    harness.resize(420);
    expect(input.parentElement).toBe(harness.bindings.actionsStart);
    expect(input.value).toBe("live draft");
    expect(render).toHaveBeenCalledOnce();
  });

  it("refreshes on host/label mutations once and disconnects queued observer work", async () => {
    const frames: Array<(time: number) => void> = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const harness = mount([action("first", 100), action("second", 200)]);
    await Promise.resolve();
    frames.splice(0).forEach((frame) => frame(0));
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    const slot = document.createElement("input");
    slot.setAttribute("data-slot-width", "200");
    harness.bindings.actionsEnd.prepend(slot);
    window.dispatchEvent(new Event("resize"));
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frames.splice(0).forEach((frame) => frame(0));
    expect(folded(harness)).toEqual(["first", "second"]);
    await Promise.resolve();
    frames.splice(0).forEach((frame) => frame(0));
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    window.dispatchEvent(new Event("resize"));
    harness.renderer.destroy();
    expect(cancel).toHaveBeenCalled();
  });

  it.each([undefined, 150, 0])("settles with a persistent overflow trigger (order %s), preserving focus and observing real changes", async (order) => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const harness = mount([action("auto", 100), action("pinned", 950, "bar"), action("menu", 200, "overflow")],
      { enabled: true, collapseAutoActions: "fit", order });
    harness.resize(600);
    const button = harness.bindings.actionsStart.querySelector<HTMLButtonElement>('[data-persona-composer-action="pinned"] button')!;
    button.focus();
    const blur = vi.fn();
    button.addEventListener("blur", blur);
    // Initial placement can schedule one follow-up, but an unchanged fit pass
    // must not keep mutating the bar and scheduling another animation frame.
    await Promise.resolve();
    frames.splice(0).forEach((frame) => frame(0));
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(folded(harness)).toEqual(["menu"]);
    expect(document.activeElement).toBe(button);
    expect(blur).not.toHaveBeenCalled();

    const existingOrder = Array.from(harness.bindings.actionsStart.children);
    harness.renderer.sync();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(Array.from(harness.bindings.actionsStart.children)).toEqual(existingOrder);
    expect(blur).not.toHaveBeenCalled();

    // A host-driven label change still invalidates fit and folds the auto
    // action. Do not silence observer records to make idle passes converge.
    sizes.set("pinned", 400);
    button.textContent = "A much longer pinned control";
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frames.splice(0).forEach((frame) => frame(0));
    expect(folded(harness)).toEqual(["auto", "menu"]);
    await Promise.resolve();
    frames.splice(0).forEach((frame) => frame(0));
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(document.activeElement).toBe(button);
    expect(blur).not.toHaveBeenCalled();
  });
});
