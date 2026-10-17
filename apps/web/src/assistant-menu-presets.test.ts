// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerMenuRenderContext, ComposerMenuRenderHandle } from "@runtypelabs/persona";
import { createAssistantMenuPreset, createReferenceMenuPlugin } from "./assistant-menu-presets";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function openDemo(product = "perplexity") {
  const controller = new AbortController();
  const context: ComposerMenuRenderContext = {
    config: {}, signal: controller.signal,
    state: { text: "", attachments: [], mentionRefs: [], activeModeIds: [], phase: "idle", inputDisabled: false, sendDisabled: true },
    items: [
      { id: "core:attachment", label: "Upload", kind: "builtin", disabled: false, busy: false },
      { id: "connectors", label: "Connectors", kind: "button", disabled: false, busy: false },
    ],
    actions: { invoke: vi.fn(() => true), close: vi.fn(), openAttachmentPicker: vi.fn(), requestUpdate: vi.fn() },
    defaultRenderer: () => ({ element: document.createElement("div") }),
  };
  const plugin = createReferenceMenuPlugin(product, vi.fn());
  const handle = plugin.renderComposerMenu!(context) as ComposerMenuRenderHandle;
  document.body.append(handle.element);
  return { controller, context, handle };
}

describe("reference menu examples", () => {
  it("uses the standard menu for ChatGPT and isolated custom examples for other products", () => {
    const standard = createAssistantMenuPreset("chatgpt", vi.fn());
    expect(standard.plugins).toEqual([]);
    expect(standard.menu).toMatchObject({ width: "composer", placement: "below", items: { "core:attachment": { description: "Upload from computer" } } });
    expect(createAssistantMenuPreset("gemini", vi.fn()).menu).toMatchObject({ openTriggerIconName: "x" });
    expect(createAssistantMenuPreset("copilot", vi.fn()).menu).toMatchObject({ placement: "above" });
  });
  it("loads checkbox sources, preserves selection and returns focus on back", () => {
    vi.useFakeTimers();
    const { handle } = openDemo();
    const connector = handle.element.querySelector<HTMLButtonElement>('[data-action="connectors"]')!;
    connector.click();
    expect(connector.getAttribute("aria-expanded")).toBe("true");
    expect(handle.element.textContent).toContain("Loading sample options");
    vi.advanceTimersByTime(450);
    const checks = handle.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checks[0].checked).toBe(true);
    expect(checks[2].disabled).toBe(true);
    checks[1].click();
    handle.element.querySelector('.persona-reference-menu__child')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(connector);
    connector.click(); vi.advanceTimersByTime(450);
    expect(handle.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].checked).toBe(true);
    handle.destroy?.();
  });
  it("cancels delayed content on close and invokes real rows through guarded actions", () => {
    vi.useFakeTimers();
    const { controller, context, handle } = openDemo();
    handle.element.querySelector<HTMLButtonElement>('[data-action="core:attachment"]')!.click();
    expect(context.actions.invoke).toHaveBeenCalledWith("core:attachment");
    handle.element.querySelector<HTMLButtonElement>('[data-action="connectors"]')!.click();
    controller.abort(); handle.destroy?.(); vi.advanceTimersByTime(500);
    expect(handle.element.querySelector('input')).toBeNull();
  });
  it("keeps parent width stable and opens separate panels on hover without moving focus", () => {
    vi.useFakeTimers();
    const { handle } = openDemo("claude");
    const connector = handle.element.querySelector<HTMLButtonElement>('[data-action="connectors"]')!;
    const upload = handle.element.querySelector<HTMLButtonElement>('[data-action="core:attachment"]')!;
    upload.focus();
    const width = handle.element.style.width;
    connector.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(140);
    const child = handle.element.querySelector<HTMLElement>('.persona-reference-menu__child')!;
    expect(child.hidden).toBe(false);
    expect(handle.element.style.width).toBe(width);
    expect(document.activeElement).toBe(upload);
    expect(child.textContent).toContain("Browse connectors");
    expect(child.textContent).not.toContain("Back to menu");
    handle.element.querySelector('.persona-reference-menu__list')!.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(200);
    child.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(200);
    expect(child.hidden).toBe(false);
    child.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(300);
    expect(child.hidden).toBe(true);
    handle.destroy?.();
  });
  it("supports arrow entry, traversal and return without dismissing the parent", () => {
    const { context, handle } = openDemo("claude");
    const connector = handle.element.querySelector<HTMLButtonElement>('[data-action="connectors"]')!;
    connector.focus();
    connector.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const buttons = handle.element.querySelectorAll<HTMLButtonElement>('.persona-reference-menu__child button');
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(connector);
    expect(context.actions.close).not.toHaveBeenCalled();
    handle.destroy?.();
  });

  it("flips submenus left and clamps them above the viewport bottom", () => {
    const { handle } = openDemo("claude");
    const connector = handle.element.querySelector<HTMLButtonElement>('[data-action="connectors"]')!;
    const child = handle.element.querySelector<HTMLElement>('.persona-reference-menu__child')!;
    const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON() {} });
    const parentRect = vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(rect(800, 600, 220, 160));
    vi.spyOn(connector, "getBoundingClientRect").mockReturnValue(rect(804, 700, 212, 32));
    vi.spyOn(child, "getBoundingClientRect").mockReturnValue(rect(0, 0, 220, 100));
    connector.focus(); connector.click();
    expect(child.style.left).toBe("576px");
    expect(child.style.top).toBe(`${window.innerHeight - 108}px`);
    parentRect.mockRestore(); handle.destroy?.();
  });

});
