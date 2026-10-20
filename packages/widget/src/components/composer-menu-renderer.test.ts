import * as sharedIcons from "../utils/icons";
import * as sharedTooltips from "../utils/tooltip";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { AgentWidgetPlugin } from "../plugins/types";
import type { AgentWidgetConfig, ComposerAction, ComposerMenuRenderContext, ComposerState } from "../types";
import { createComposerActionRenderer } from "./composer-actions";
import { bindComposerSurface } from "./composer-bindings";
import { buildComposer } from "./composer-builder";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((fn) => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });

function mount(options: { plugins?: AgentWidgetPlugin[]; shadow?: boolean } = {}) {
  const config: AgentWidgetConfig = { apiUrl: "/api", attachments: { enabled: true }, composer: { actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] } } };
  let state: ComposerState = { text: "", attachments: [], mentionRefs: [], activeModeIds: [], phase: "idle", inputDisabled: false, sendDisabled: false };
  const onSelect = vi.fn();
  const actions: ComposerAction[] = [{ id: "search", placement: "start", presentation: "overflow", label: "Search", description: "Find sources", group: "tools", iconName: "search", disableWhenStreaming: true, disabled: (current) => current.text === "locked", visible: (current) => current.text !== "hidden", onSelect }];
  let plugins = options.plugins ?? [];
  const elements = buildComposer({ config });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = options.shadow ? host.attachShadow({ mode: "open" }) : host;
  root.appendChild(elements.footer);
  const bindings = bindComposerSurface(elements.footer)!;
  const reportError = vi.fn();
  const collect = vi.fn(() => ({ builtIns: [{ id: "core:attachment", placement: "start" as const, order: 200, element: elements.attachmentButtonWrapper! }], configActions: actions, plugins, contributionContext: { config, getState: () => state, requestRender: () => renderer.resolve() } }));
  const renderer = createComposerActionRenderer({ deps: { renderLucideIcon: sharedIcons.renderLucideIcon, attachTooltip: sharedTooltips.attachTooltip, hideTooltipFor: sharedTooltips.hideTooltipFor }, getBindings: () => bindings, collect, getState: () => state, getOverflow: () => config.composer!.actionOverflow, reportError, actionContext: { getState: () => state, getValue: () => state.text, setValue: (text) => { state = { ...state, text }; }, submit: () => {}, openAttachmentPicker: () => {}, toggleVoice: () => {}, requestRender: () => renderer.resolve() } });
  renderer.resolve();
  cleanups.push(renderer.destroy);
  const menu = renderer.getOverflowMenu()!;
  return { renderer, menu, root, config, actions, reportError, onSelect, collect, state: () => state, setState: (patch: Partial<ComposerState>, sync = true) => { state = { ...state, ...patch }; if (sync) renderer.sync(); }, setPlugins: (next: AgentWidgetPlugin[]) => { plugins = next; renderer.resolve(); } };
}

const plugin = (renderComposerMenu: NonNullable<AgentWidgetPlugin["renderComposerMenu"]>, id = "custom"): AgentWidgetPlugin => ({ id, renderComposerMenu });
const customButton = () => { const button = document.createElement("button"); button.textContent = "Custom control"; return button; };

it("renders descriptions, adjacent groups, builtin labels, and live width/icon configuration", () => {
  const h = mount();
  h.config.composer!.actionOverflow!.menu = { width: "composer", descriptionLayout: "inline", openTriggerIconName: "x", items: { "core:attachment": { label: "Add photos & files", description: "Upload from computer", group: "files" } } };
  vi.spyOn(h.menu.triggerButton, "getBoundingClientRect").mockReturnValue({ top: 400, bottom: 432, left: 10, right: 42, width: 32, height: 32 } as DOMRect);
  const form = h.menu.trigger.closest("form")!;
  vi.spyOn(form, "getBoundingClientRect").mockReturnValue({ top: 350, bottom: 440, left: 24, right: 504, width: 480, height: 90 } as DOMRect);
  h.renderer.resolve();
  const closedIcon = h.menu.triggerButton.innerHTML;
  h.menu.open();
  expect(h.menu.panel.style.width).toBe("480px");
  expect(h.menu.panel.getAttribute("data-persona-menu-description-layout")).toBe("inline");
  expect(h.menu.panel.style.left).toBe("24px");
  expect(h.menu.panel.style.top).toBe("344px");
  expect(h.menu.panel.textContent).toContain("Add photos & filesUpload from computer");
  expect(h.menu.panel.textContent).toContain("SearchFind sources");
  expect(h.menu.panel.querySelectorAll('[role="separator"]')).toHaveLength(1);
  expect(h.menu.triggerButton.innerHTML).not.toBe(closedIcon);
  expect(h.menu.panel.getAttribute("role")).toBe("menu");
  h.config.composer!.actionOverflow!.menu = { width: "22rem" };
  h.renderer.resolve();
  expect(h.menu.panel.style.width).toBe("22rem");
  expect(h.menu.panel.getAttribute("data-persona-menu-description-layout")).toBe("stacked");
  expect(h.menu.panel.textContent).not.toContain("Upload from computer");
});

it("arbitrates errors and null results then updates one managed handle with frozen public data", async () => {
  let context!: ComposerMenuRenderContext;
  const update = vi.fn((next: ComposerMenuRenderContext) => { context = next; });
  const last = vi.fn(() => customButton());
  const first = vi.fn(() => { throw new Error("renderer failed"); });
  const winner = vi.fn((next: ComposerMenuRenderContext) => { context = next; return { element: customButton(), update }; });
  const h = mount({ plugins: [plugin(first, "broken"), plugin(() => null, "pass"), plugin(winner), plugin(last, "last")] });
  h.menu.open();
  expect(h.reportError).toHaveBeenCalledOnce();
  expect(last).not.toHaveBeenCalled();
  expect(h.menu.panel.getAttribute("role")).toBe("dialog");
  expect(h.menu.triggerButton.getAttribute("aria-haspopup")).toBe("dialog");
  expect(Object.isFrozen(context.items)).toBe(true);
  expect(Object.isFrozen(context.items[0])).toBe(true);
  expect(Object.isFrozen(context.state.attachments)).toBe(true);
  expect(context.items.find((item) => item.id === "search")).not.toHaveProperty("onSelect");
  h.setState({ text: "draft" });
  expect(winner).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledOnce();
  expect(context.state.text).toBe("draft");
  const collected = h.collect.mock.calls.length;
  context.actions.requestUpdate(); context.actions.requestUpdate();
  await Promise.resolve();
  expect(h.collect.mock.calls.length).toBe(collected + 1);
  expect(winner).toHaveBeenCalledOnce();
});

it("aborts before exactly one cleanup on each close, reopening, plugin removal, and destroy", () => {
  const contexts: ComposerMenuRenderContext[] = [];
  const signalsAtCleanup: boolean[] = [];
  const h = mount({ plugins: [plugin((context) => { contexts.push(context); return { element: customButton(), destroy: () => signalsAtCleanup.push(context.signal.aborted) }; })] });
  h.menu.open(); h.menu.close(true); h.menu.close();
  expect(signalsAtCleanup).toEqual([true]);
  expect(document.activeElement).toBe(h.menu.triggerButton);
  h.menu.open();
  expect(contexts[1].signal).not.toBe(contexts[0].signal);
  h.setPlugins([]);
  expect(h.menu.isOpen()).toBe(false);
  expect(signalsAtCleanup).toEqual([true, true]);
  h.setPlugins([plugin((context) => { contexts.push(context); return { element: customButton(), destroy: () => signalsAtCleanup.push(context.signal.aborted) }; })]);
  h.menu.open(); h.renderer.destroy(); h.renderer.destroy();
  expect(signalsAtCleanup).toEqual([true, true, true]);
  expect(contexts.every((context) => context.signal.aborted)).toBe(true);
});

it("cancels an opening closed by its renderer and retires the returned handle", () => {
  const destroy = vi.fn();
  const second = vi.fn(() => customButton());
  let signal!: AbortSignal;
  const h = mount({ plugins: [plugin((context) => { signal = context.signal; context.actions.close(); return { element: customButton(), destroy }; }), plugin(second, "second")] });
  h.menu.open();
  expect(signal.aborted).toBe(true);
  expect(h.menu.isOpen()).toBe(false);
  expect(h.menu.panel.isConnected).toBe(false);
  expect(destroy).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
});

it("lets custom controls own arrows, Tab, and nested Escape; outer Escape restores trigger focus", () => {
  const input = document.createElement("input");
  const h = mount({ plugins: [plugin(() => input)] });
  h.menu.open();
  expect(document.activeElement).toBe(input);
  for (const key of ["ArrowDown", "Home", "Tab"]) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(h.menu.isOpen()).toBe(true);
  }
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") event.preventDefault(); }, { once: true });
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(h.menu.isOpen()).toBe(true);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(h.menu.isOpen()).toBe(false);
  expect(document.activeElement).toBe(h.menu.triggerButton);
});

it("checks current visibility, disabled state, streaming, membership, and busy state before invoking", async () => {
  let context!: ComposerMenuRenderContext;
  const h = mount({ plugins: [plugin((next) => { context = next; return { element: customButton(), update: (next) => { context = next; } }; })] });
  h.menu.open();
  expect(context.actions.invoke("missing")).toBe(false);
  h.setState({ text: "locked" }, false);
  expect(context.actions.invoke("search")).toBe(false);
  h.setState({ text: "hidden" }, false);
  expect(context.actions.invoke("search")).toBe(false);
  h.setState({ text: "", phase: "streaming" }, false);
  expect(context.actions.invoke("search")).toBe(false);
  h.setState({ phase: "idle" });
  let finish!: () => void;
  h.onSelect.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  expect(context.actions.invoke("search")).toBe(true);
  expect(h.menu.isOpen()).toBe(false);
  expect(context.actions.invoke("search")).toBe(false);
  h.menu.open();
  expect(context.items.find((item) => item.id === "search")?.busy).toBe(true);
  expect(context.actions.invoke("search")).toBe(false);
  finish(); await Promise.resolve(); await Promise.resolve();
  expect(context.items.find((item) => item.id === "search")?.busy).toBe(false);
  expect(context.actions.invoke("search")).toBe(true);
  expect(h.onSelect).toHaveBeenCalledTimes(2);
});

it("keeps builtin picker activation on its live control and gates disabled attachments", () => {
  let context!: ComposerMenuRenderContext;
  const h = mount({ plugins: [plugin((next) => { context = next; return customButton(); })] });
  const control = h.root.querySelector<HTMLButtonElement>('[data-persona-composer-attachment-button]') ?? h.menu.panel.querySelector<HTMLButtonElement>("button")!;
  const click = vi.spyOn(control, "click");
  control.disabled = true;
  h.menu.open(); context.actions.openAttachmentPicker();
  expect(click).not.toHaveBeenCalled();
  expect(h.menu.isOpen()).toBe(true);
  control.disabled = false;
  context.actions.openAttachmentPicker();
  expect(click).toHaveBeenCalledOnce();
  expect(h.menu.isOpen()).toBe(false);
});

it("opens available attachments from custom content even when the native control remains in the bar", () => {
  let context!: ComposerMenuRenderContext;
  const h = mount({ plugins: [plugin((next) => { context = next; return customButton(); })] });
  h.config.composer!.actionOverflow!.includeBuiltIns = [];
  h.renderer.resolve();
  const control = h.root.querySelector<HTMLButtonElement>('[data-persona-composer-attachment-button]')!;
  const click = vi.spyOn(control, "click");
  h.menu.open();
  expect(context.items.some((item) => item.id === "core:attachment")).toBe(false);
  context.actions.openAttachmentPicker();
  expect(click).toHaveBeenCalledOnce();
  expect(h.menu.isOpen()).toBe(false);
});

it("falls back safely when an update throws and aborts the broken renderer", () => {
  const destroy = vi.fn();
  let signal!: AbortSignal;
  const h = mount({ plugins: [plugin((context) => { signal = context.signal; return { element: customButton(), destroy, update: () => { throw new Error("bad update"); } }; })] });
  h.menu.open(); h.renderer.sync();
  expect(signal.aborted).toBe(true);
  expect(destroy).toHaveBeenCalledOnce();
  expect(h.menu.panel.getAttribute("role")).toBe("menu");
  expect(h.menu.panel.querySelector('[role="menuitem"]')).not.toBeNull();
  expect(h.menu.panel.contains(document.activeElement)).toBe(true);
  expect(h.reportError).toHaveBeenCalledOnce();
  h.menu.close();
  expect(destroy).toHaveBeenCalledOnce();
});

it("retains default menu keyboard behavior when a plugin returns the default renderer", () => {
  const h = mount({ plugins: [plugin((context) => context.defaultRenderer())] });
  h.menu.open();
  expect(h.menu.panel.getAttribute("role")).toBe("menu");
  const first = document.activeElement;
  h.menu.panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  expect(document.activeElement).not.toBe(first);
  expect(document.activeElement?.textContent).toContain("Search");
});

it("dismisses custom content safely across a shadow boundary", () => {
  let context!: ComposerMenuRenderContext;
  const h = mount({ shadow: true, plugins: [plugin((next) => { context = next; return customButton(); })] });
  h.menu.open();
  expect(h.menu.panel.getRootNode()).toBe(h.root);
  const outside = document.createElement("button"); document.body.appendChild(outside);
  outside.focus();
  expect(h.menu.isOpen()).toBe(false);
  expect(context.signal.aborted).toBe(true);
  expect(document.activeElement).toBe(outside);
});

it("prevents recursive opening from abort and teardown callbacks", () => {
  let reopen = () => {};
  const render = vi.fn((context: ComposerMenuRenderContext) => {
    context.signal.addEventListener("abort", () => reopen());
    return { element: customButton(), destroy: () => reopen() };
  });
  const h = mount({ plugins: [plugin(render)] });
  reopen = () => h.menu.open();
  h.menu.open(); h.menu.close();
  expect(render).toHaveBeenCalledOnce();
  expect(h.menu.isOpen()).toBe(false);
});

it("retires a renderer removed during its own update without a second cleanup", () => {
  const destroy = vi.fn();
  let remove = () => {};
  let context!: ComposerMenuRenderContext;
  const h = mount({ plugins: [plugin((next) => { context = next; return { element: customButton(), destroy, update: () => remove() }; })] });
  remove = () => h.setPlugins([]);
  h.menu.open(); h.renderer.sync();
  expect(h.menu.isOpen()).toBe(false);
  expect(context.signal.aborted).toBe(true);
  expect(destroy).toHaveBeenCalledOnce();
});

it("respects a close from an abort listener when an update fails", () => {
  const destroy = vi.fn();
  let close = () => {};
  const h = mount({ plugins: [plugin((context) => {
    context.signal.addEventListener("abort", () => close());
    return { element: customButton(), destroy, update: () => { throw new Error("failed update"); } };
  })] });
  close = () => h.menu.close();
  h.menu.open(); h.renderer.sync();
  expect(h.menu.isOpen()).toBe(false);
  expect(destroy).toHaveBeenCalledOnce();
});


it("does not retain dismissal listeners when a custom focus handler closes during opening", () => {
  const h = mount({ plugins: [plugin((context) => {
    const element = customButton();
    element.addEventListener("focus", () => context.actions.close());
    return element;
  })] });
  const add = vi.spyOn(document, "addEventListener");
  h.menu.open();
  expect(h.menu.isOpen()).toBe(false);
  expect(add.mock.calls.some(([type]) => type === "focusin")).toBe(false);
});
