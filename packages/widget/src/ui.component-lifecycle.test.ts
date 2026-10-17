// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { componentRegistry } from "./components/registry";
import type { AgentWidgetComponentRenderContext, AgentWidgetComponentRenderer } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
function mount(v5: boolean, components: Record<string, AgentWidgetComponentRenderer>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const controller = createAgentExperience(host, {
    apiUrl: "https://example.test/dispatch",
    launcher: { enabled: false },
    persistState: false,
    future: { v5Defaults: v5 },
    components,
  });
  controllers.push(controller);
  return { host, controller };
}

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  componentRegistry.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe.each([false, true])("component lifecycle (V5=%s)", (v5) => {
  it("isolates configured names from other instances and explicit global fallbacks", () => {
    const renderer = (label: string): AgentWidgetComponentRenderer => () => {
      const element = document.createElement("div");
      element.textContent = label;
      element.dataset.testComponent = label;
      return element;
    };
    componentRegistry.register("Card", renderer("global"));
    const a = mount(v5, { Card: renderer("a") });
    const b = mount(v5, { Card: renderer("b") });
    const c = mount(v5, {});
    for (const { controller } of [a, b, c]) controller.injectComponentDirective({ id: "card", component: "Card" });
    expect(a.host.querySelector('[data-test-component="a"]')).not.toBeNull();
    expect(b.host.querySelector('[data-test-component="b"]')).not.toBeNull();
    expect(c.host.querySelector('[data-test-component="global"]')).not.toBeNull();
    a.controller.update({ copy: { inputPlaceholder: "Updated" } });
    expect(a.host.querySelector('[data-test-component="a"]')).not.toBeNull();
  });

  it("does not resolve prototype properties as configured component renderers", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { host, controller } = mount(v5, {});
    for (const component of ["constructor", "toString", "__proto__"]) {
      expect(() => controller.injectComponentDirective({ component, text: "Missing component" })).not.toThrow();
    }
    expect(host.textContent?.match(/Missing component/g)).toHaveLength(3);
  });

  it("updates props using the same mounted element, message identity and lifetime", async () => {
    let context!: AgentWidgetComponentRenderContext;
    const destroy = vi.fn();
    const update = vi.fn((props: Record<string, unknown>, next: AgentWidgetComponentRenderContext) => {
      expect(next).toBe(context);
      element.textContent = String(props.label);
    });
    const element = document.createElement("input");
    const renderer = vi.fn<AgentWidgetComponentRenderer>((_props, ctx) => {
      context = ctx;
      return { element, update, destroy };
    });
    const { host, controller } = mount(v5, { Card: renderer });
    const message = controller.injectComponentDirective({ id: "stable", component: "Card", props: { label: "first", drop: true } });
    element.value = "unsent form input";
    context.updateProps({ label: "second" });
    await Promise.resolve();
    const changed = controller.getMessages().find((item) => item.id === message.id)!;
    expect(JSON.parse(changed.rawContent!)).toMatchObject({ props: { label: "second" } });
    expect(JSON.parse(changed.rawContent!).props).not.toHaveProperty("drop");
    expect(changed.createdAt).toBe(message.createdAt);
    expect(changed.sequence).toBe(message.sequence);
    expect(host.contains(element)).toBe(true);
    expect(element.value).toBe("unsent form input");
    expect(context.message).toBe(changed);
    expect(context.signal?.aborted).toBe(false);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("retires a legacy renderer's signal before replacement and rejects stale prop writes", async () => {
    const contexts: AgentWidgetComponentRenderContext[] = [];
    const { controller } = mount(v5, { Card: (_props, context) => {
      contexts.push(context);
      return document.createElement("div");
    } });
    controller.injectComponentDirective({ id: "card", component: "Card", props: { value: 1 } });
    expect(controller.updateComponentProps("card", { value: 2 })).toBe(true);
    expect(contexts[0].signal?.aborted).toBe(true);
    expect(contexts[1].signal?.aborted).toBe(false);
    contexts[0].updateProps({ value: "stale" });
    await Promise.resolve();
    expect(JSON.parse(controller.getMessages()[0].rawContent!).props).toEqual({ value: 2 });
  });

  it("cleans up once on remove, clear and destroy, with abort preceding destroy", () => {
    const calls: string[] = [];
    const { controller } = mount(v5, { Card: (_props, context) => ({
      element: document.createElement("div"),
      destroy: () => {
        expect(context.signal?.aborted).toBe(true);
        calls.push(context.message.id);
      },
    }) });
    controller.injectComponentDirective({ id: "remove", component: "Card" });
    expect(controller.removeComponentMessage("remove")).toBe(true);
    expect(controller.removeComponentMessage("remove")).toBe(false);
    controller.injectComponentDirective({ id: "clear", component: "Card" });
    controller.clearChat();
    controller.injectComponentDirective({ id: "destroy", component: "Card" });
    controllers.splice(controllers.indexOf(controller), 1);
    controller.destroy();
    expect(calls).toEqual(["remove", "clear", "destroy"]);
  });

  it("keeps lifetimes through unrelated morphs and temporary host detachment", () => {
    let signal!: AbortSignal;
    const destroy = vi.fn();
    const element = document.createElement("div");
    const { host, controller } = mount(v5, { Card: (_props, context) => {
      signal = context.signal!;
      return { element, update: () => {}, destroy };
    } });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    host.remove();
    controller.injectUserMessage({ content: "next" });
    document.body.appendChild(host);
    expect(host.contains(element)).toBe(true);
    expect(signal.aborted).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("preserves legacy component lifetime when another assistant becomes the latest message", () => {
    const element = document.createElement("div");
    let signal!: AbortSignal;
    const renderer = vi.fn<AgentWidgetComponentRenderer>((_props, context) => {
      signal = context.signal!;
      return element;
    });
    const { host, controller } = mount(v5, { Card: renderer });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    controller.injectAssistantMessage({ content: "another assistant" });
    expect(host.contains(element)).toBe(true);
    expect(signal.aborted).toBe(false);
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it("retires a component when its message becomes plain text", () => {
    const destroy = vi.fn();
    const { controller } = mount(v5, { Card: () => ({ element: document.createElement("div"), destroy }) });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    controller.injectAssistantMessage({ id: "card", content: "plain", rawContent: "plain" });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(controller.updateComponentProps("card", {})).toBe(false);
    expect(controller.removeComponentMessage("card")).toBe(false);
  });

  it("replaces config renderers and retires previous lifetime before invoking the replacement", () => {
    let signal!: AbortSignal;
    const destroy = vi.fn();
    const { controller } = mount(v5, { Card: (_props, context) => {
      signal = context.signal!;
      return { element: document.createElement("div"), destroy };
    } });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    controller.update({ components: { Card: () => {
      expect(signal.aborted).toBe(true);
      expect(destroy).toHaveBeenCalledTimes(1);
      return document.createElement("div");
    } } });
  });

  it("defers a prop write made inside the initial renderer until hydration completes", async () => {
    const element = document.createElement("div");
    const update = vi.fn();
    const { host, controller } = mount(v5, { Card: (_props, context) => {
      context.updateProps({ ready: true });
      return { element, update };
    } });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    expect(host.contains(element)).toBe(true);
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith({ ready: true }, expect.objectContaining({ message: expect.objectContaining({ id: "card" }) }));
  });

  it("retires removed config renderers and restores the global fallback", () => {
    const global = document.createElement("div");
    global.dataset.globalFallback = "true";
    componentRegistry.register("Card", () => global);
    const destroy = vi.fn();
    const { host, controller } = mount(v5, { Card: () => ({ element: document.createElement("div"), destroy }) });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    controller.update({ components: {} });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.contains(global)).toBe(true);
  });

  it("retains managed element and lifetime when bubble chrome changes", () => {
    const element = document.createElement("div");
    const destroy = vi.fn();
    let signal!: AbortSignal;
    const { controller } = mount(v5, { Card: (_props, context) => {
      signal = context.signal!;
      return { element, update: () => {}, destroy };
    } });
    controller.injectComponentDirective({ id: "card", component: "Card" });
    expect(element.closest(".persona-message-bubble")).not.toBeNull();
    controller.update({ wrapComponentDirectiveInBubble: false });
    expect(element.closest(".persona-message-bubble")).toBeNull();
    expect(signal.aborted).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("retires failed managed updates and falls back without leaving stale component DOM", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const element = document.createElement("div");
    element.dataset.failedComponent = "true";
    const destroy = vi.fn();
    const { host, controller } = mount(v5, { Card: () => ({
      element,
      update: () => { throw new Error("update failed"); },
      destroy,
    }) });
    controller.injectComponentDirective({ id: "card", component: "Card", text: "fallback", props: { value: 1 } });
    controller.updateComponentProps("card", { value: 2 });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector("[data-failed-component]")).toBeNull();
    expect(host.textContent).toContain("fallback");
  });
});
