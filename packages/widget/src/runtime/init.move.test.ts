// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAgentWidget, getAgentWidgetHandles, type AgentWidgetInitHandle } from "./init";
import type { AgentWidgetConfig, AgentWidgetComponentRenderContext, VoiceProvider, VoiceResult } from "../types";
import { buildAssistantTurnFrames } from "../testing/mock-stream";
import { createStaticMentionSource } from "../utils/mention-matcher";
import { loadContextMentions } from "../context-mentions-loader";
import { loadContextMentionsInline } from "../context-mentions-inline-loader";
import { createPopover } from "../plugin-kit";
import { attachTooltip } from "../utils/tooltip";

const handles: AgentWidgetInitHandle[] = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup(v5Defaults = false, useShadowDom = false, config: AgentWidgetConfig = {}) {
  document.body.innerHTML = '<div id="sidebar"></div><div id="modal"></div><button id="external">Outside</button>';
  const handle = initAgentWidget({ target: "#sidebar", useShadowDom, config: {
    apiUrl: "/chat", persistState: false, launcher: { enabled: false },
    layout: { embedded: true }, welcome: { variant: "none" }, future: { v5Defaults },
    features: { streamAnimation: { type: "none" }, artifacts: { enabled: false } }, ...config,
  } });
  handles.push(handle);
  const root = (handle.host.shadowRoot ?? handle.host).querySelector<HTMLElement>("[data-persona-root]")!;
  const input = () => root.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  return { handle, root, input, sidebar: document.getElementById("sidebar")!, modal: document.getElementById("modal")! };
}
beforeEach(() => {
  window.scrollTo = vi.fn();
  // jsdom cannot compute the injected dock/mention stylesheet's selectors;
  // these tests supply geometry explicitly and only need inline style values.
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => (element as HTMLElement).style);
});
afterEach(() => {
  handles.splice(0).reverse().forEach(handle => handle.destroy());
  document.body.replaceChildren(); document.head.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear();
});

describe.each([false, true])("live relocation (V5=%s)", v5 => {
  it.each([false, true])("preserves host, root, draft, component/slot lifetimes and subscriptions (shadow=%s)", shadow => {
    const card = document.createElement("input");
    const slot = document.createElement("button");
    const destroyCard = vi.fn(); const destroySlot = vi.fn(); const updateSlot = vi.fn();
    let context!: AgentWidgetComponentRenderContext;
    const renderer = vi.fn((_props, ctx: AgentWidgetComponentRenderContext) => { context = ctx; return { element: card, update: vi.fn(), destroy: destroyCard }; });
    const renderSlot = vi.fn(() => ({ element: slot, update: updateSlot, destroy: destroySlot }));
    const { handle, root, input, sidebar, modal } = setup(v5, shadow, {
      components: { Card: renderer }, layout: { embedded: true, slots: { "transcript-top": renderSlot } },
      composer: { modes: [{ id: "concise", label: "Concise" }] },
    });
    const host = handle.host; const shadowRoot = host.shadowRoot; const instance = handle.instanceId;
    handle.injectComponentDirective({ id: "card", component: "Card" });
    card.value = "unsaved component field";
    handle.setMessage("draft to keep"); handle.setComposerModes(["concise"]);
    input().focus(); input().setSelectionRange(2, 7, "backward");
    const editor = input(); const state = handle.getComposerState();
    const changed = vi.fn(); const unsubscribe = handle.on("messages:changed", changed);
    const registry = getAgentWidgetHandles();
    const slotCalls = renderSlot.mock.calls.length;
    handle.moveTo("#modal");
    expect(handle.host).toBe(host); expect(host.parentElement).toBe(modal);
    expect(host.shadowRoot).toBe(shadowRoot); expect((host.shadowRoot ?? host).contains(root)).toBe(true);
    expect(handle.instanceId).toBe(instance); expect(getAgentWidgetHandles()).toEqual(registry);
    expect(input()).toBe(editor); expect(handle.getComposerState()).toEqual(state);
    expect((host.shadowRoot ?? document).activeElement).toBe(editor);
    expect([editor.selectionStart, editor.selectionEnd, editor.selectionDirection]).toEqual([2, 7, "backward"]);
    expect(card.value).toBe("unsaved component field"); expect(root.contains(card)).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(1); expect(renderSlot).toHaveBeenCalledTimes(slotCalls);
    expect(updateSlot).not.toHaveBeenCalled(); expect(context.signal?.aborted).toBe(false);
    expect(destroyCard).not.toHaveBeenCalled(); expect(destroySlot).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled(); expect(window.scrollTo).not.toHaveBeenCalled();
    handle.injectAssistantMessage({ content: "still subscribed" });
    expect(changed.mock.lastCall?.[1]).toEqual({ instanceId: instance });
    unsubscribe(); changed.mockClear(); handle.injectUserMessage({ content: "unsubscribed" });
    expect(changed).not.toHaveBeenCalled();
    handle.moveTo(sidebar); handle.update({ copy: { inputPlaceholder: "after moving" } });
    expect(host.parentElement).toBe(sidebar);
    handle.destroy(); expect(host.isConnected).toBe(false);
    expect(destroyCard).toHaveBeenCalledTimes(1); expect(destroySlot).toHaveBeenCalledTimes(1);
  });

  it("continues the same SSE run across a move and finishes once", async () => {
    const { handle, modal } = setup(v5);
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { writer = controller; }, cancel });
    const started = vi.fn(); const finished = vi.fn(); const changed = vi.fn();
    handle.on("run:started", started); handle.on("run:finished", finished); handle.on("messages:changed", changed);
    const frames = buildAssistantTurnFrames({ executionId: "move-run", text: "a live stream continues here", chunkSize: 5 });
    const encode = (frame: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`);
    const done = handle.connectStream(stream);
    frames.slice(0, 3).forEach(frame => writer.enqueue(encode(frame)));
    await flush();
    expect(handle.getState().streaming).toBe(true);
    const before = handle.getMessages();
    handle.moveTo(modal);
    expect(handle.getMessages()).toEqual(before); expect(handle.getState().streaming).toBe(true);
    expect(cancel).not.toHaveBeenCalled(); expect(started).toHaveBeenCalledTimes(1); expect(finished).not.toHaveBeenCalled();
    frames.slice(3).forEach(frame => writer.enqueue(encode(frame))); writer.close();
    await done;
    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
    expect(finished.mock.lastCall?.[0]).toMatchObject({ runId: started.mock.lastCall?.[0].runId, outcome: "success" });
    expect(handle.getMessages().some(message => message.content.includes("a live stream continues here"))).toBe(true);
    expect(changed.mock.lastCall?.[1]).toEqual({ instanceId: handle.instanceId });
  });
});

it("validates invalid destinations before touching the host and uses the latest target for layout rebuilds", () => {
  const { handle, modal, root, sidebar } = setup();
  const foreign = document.implementation.createHTMLDocument().body;
  const shadow = document.createElement("div"); document.body.append(shadow);
  const shadowTarget = document.createElement("div"); shadow.attachShadow({ mode: "open" }).append(shadowTarget);
  for (const target of ["#missing", document.createElement("div"), foreign, shadowTarget, root, handle.host, null] as Array<string | HTMLElement>) {
    expect(() => handle.moveTo(target)).toThrow(); expect(handle.host.parentElement).toBe(sidebar);
  }
  expect(() => handle.moveTo("[" )).toThrow();
  handle.moveTo(modal);
  const original = handle.host;
  const append = vi.spyOn(modal, "appendChild");
  handle.moveTo(modal); expect(append).not.toHaveBeenCalled();
  handle.update({ launcher: { mountMode: "docked" } });
  expect(original.isConnected).toBe(false);
  expect(modal.parentElement?.dataset.personaDockRole).toBe("content");
  expect(() => handle.moveTo(sidebar)).toThrow(/Docked/);
  handle.destroy(); expect(modal.parentElement).toBe(document.body);
  expect(() => handle.moveTo(sidebar)).toThrow(/destroyed/);
});

it("uses native state-preserving moves when available and leaves external focus alone", () => {
  const { handle, input, modal, sidebar } = setup();
  const native = vi.fn((node: Node) => { modal.appendChild(node); });
  Object.defineProperty(modal, "moveBefore", { value: native });
  const external = document.getElementById("external")!; external.focus();
  handle.moveTo(modal);
  expect(native).toHaveBeenCalledWith(handle.host, null); expect(document.activeElement).toBe(external);
  input().focus(); handle.moveTo(sidebar, { preserveFocus: false });
  expect(document.activeElement).not.toBe(input());
});

it("restores contenteditable selection and committed inline mentions through fallback relocation", async () => {
  const { handle, root, modal } = setup(true, false, { contextMentions: {
    enabled: true, display: "inline", sources: [createStaticMentionSource({ id: "files", label: "Files", items: [{ id: "brief", label: "Brief" }], resolve: () => ({ llmAppend: "brief context" }) })],
  } });
  await loadContextMentionsInline(); await flush();
  const editor = root.querySelector<HTMLElement>("[data-persona-composer-input]")!;
  root.querySelector<HTMLButtonElement>("[data-persona-composer-mention-button]")!.click();
  await loadContextMentions();
  await vi.waitFor(() => expect(document.querySelector("[role=option]")).not.toBeNull());
  document.querySelector("[role=option]")!.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }));
  editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  await vi.waitFor(() => expect(handle.getComposerState().mentionRefs).toHaveLength(1));
  const token = editor.querySelector(".persona-mention-token")!;
  const text = document.createTextNode("after token"); editor.append(text); editor.focus();
  document.getSelection()!.setBaseAndExtent(text, 2, text, 6);
  const before = handle.getComposerState();
  handle.moveTo(modal);
  expect(editor.querySelector(".persona-mention-token")).toBe(token);
  expect(handle.getComposerState()).toEqual(before); expect(document.activeElement).toBe(editor);
  expect(document.getSelection()?.anchorNode).toBe(text);
  expect([document.getSelection()?.anchorOffset, document.getSelection()?.focusOffset]).toEqual([2, 6]);
});

it("keeps an in-flight attachment upload and dictation provider alive", async () => {
  let finishUpload!: (part: { type: "text"; text: string }) => void;
  let uploadSignal!: AbortSignal;
  let voiceResult: (result: VoiceResult) => void = () => {};
  const provider: VoiceProvider = {
    type: "custom", connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    startListening: vi.fn(async () => {}), stopListening: vi.fn(async () => {}),
    onResult: callback => { voiceResult = callback; }, onStatusChange: () => {}, onError: () => {},
  };
  const { handle, root, modal } = setup(true, false, {
    attachments: { enabled: true, allowedTypes: ["text/plain"], adapter: { add: (_file, context) => {
      uploadSignal = context.signal; return new Promise(resolve => { finishUpload = resolve; });
    } } },
    voiceRecognition: { enabled: true, completionBehavior: "review", dictation: { display: "transcript", provider: { type: "custom", custom: () => provider } } },
  });
  handle.setMessage("keep draft");
  const fileInput = root.querySelector<HTMLInputElement>("[data-persona-composer-attachment-input]")!;
  Object.defineProperty(fileInput, "files", { value: [new File(["text"], "note.txt", { type: "text/plain" })] });
  fileInput.dispatchEvent(new Event("change", { bubbles: true })); await flush();
  handle.startDictation(); await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledTimes(1));
  const before = handle.getComposerState();
  handle.moveTo(modal);
  expect(uploadSignal.aborted).toBe(false); expect(handle.getComposerState()).toEqual(before);
  expect(provider.stopListening).not.toHaveBeenCalled(); expect(provider.disconnect).not.toHaveBeenCalled();
  voiceResult({ text: "spoken after moving", isFinal: false, provider: "custom" });
  expect(handle.getDictationState().phase).toBe("recording");
  finishUpload({ type: "text", text: "uploaded context" });
  await vi.waitFor(() => expect(handle.getComposerState().attachments[0]?.status).toBe("ready"));
  handle.cancelDictation(); expect(handle.getComposerState().text).toBe("keep draft");
});

it("repositions transient overlays for only the moved widget", () => {
  const { handle, root, modal, sidebar } = setup();
  const dialog = document.createElement("dialog"); dialog.setAttribute("open", "");
  document.body.append(dialog); dialog.append(modal);
  const anchor = document.createElement("button"); root.append(anchor);
  const otherRoot = document.createElement("div"); otherRoot.dataset.personaRoot = "true"; document.body.append(otherRoot);
  const otherAnchor = document.createElement("button"); otherRoot.append(otherAnchor);
  const otherRect = vi.spyOn(otherAnchor, "getBoundingClientRect");
  const otherContent = document.createElement("div");
  const otherPopover = createPopover({ anchor: otherAnchor, content: otherContent }); otherPopover.open(); otherRect.mockClear();
  let left = 10;
  vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => ({ left, right: left + 40, top: 10, bottom: 30, width: 40, height: 20 } as DOMRect));
  const content = document.createElement("div");
  const popover = createPopover({ anchor, content }); popover.open();
  const menuInput = document.createElement("input"); content.append(menuInput); menuInput.focus();
  const tooltip = attachTooltip({ anchor, text: "Moving tooltip" }); tooltip.show();
  expect(content.style.left).toBe("10px");
  left = 300; handle.moveTo(modal);
  expect(content.parentElement).toBe(dialog); expect(document.activeElement).toBe(menuInput);
  expect(content.style.left).toBe("300px");
  expect(Number.parseFloat(document.querySelector<HTMLElement>('[role="tooltip"]')!.style.left)).toBeGreaterThan(250);
  expect(document.querySelector('[role="tooltip"]')?.parentElement).toBe(dialog);
  expect(otherRect).not.toHaveBeenCalled(); expect(otherContent.parentElement).toBe(document.body);
  popover.close(); handle.moveTo(sidebar); popover.open();
  expect(content.parentElement).toBe(document.body);
  popover.close(); handle.moveTo(modal); popover.open();
  expect(content.parentElement).toBe(dialog);
  popover.destroy(); tooltip.destroy(); otherPopover.destroy();
});

it.each(["follow", "paused", "none", "anchor-top"] as const)("preserves %s scrolling across reflow and repeated moves", mode => {
  const { handle, root, modal, sidebar } = setup(true, false, { features: { scrollBehavior: { mode: mode === "paused" ? "follow" : mode }, artifacts: { enabled: false } } });
  const message = handle.injectAssistantMessage({ content: "Visible reading anchor" });
  const body = root.querySelector<HTMLElement>(".persona-widget-body")!;
  const bubble = root.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`)!;
  let scrollTop = mode === "follow" ? 900 : 450;
  const inModal = () => handle.host.parentElement === modal;
  Object.defineProperties(body, {
    clientHeight: { configurable: true, get: () => inModal() ? 500 : 300 },
    scrollHeight: { configurable: true, get: () => inModal() ? 1600 : 1200 },
    scrollTop: { configurable: true, get: () => scrollTop, set: value => { scrollTop = value; } },
  });
  vi.spyOn(body, "getBoundingClientRect").mockImplementation(() => ({ top: 100, bottom: 100 + body.clientHeight } as DOMRect));
  vi.spyOn(bubble, "getBoundingClientRect").mockImplementation(() => {
    const top = 100 + (inModal() ? 740 : 420) - scrollTop;
    return { top, bottom: top + 80 } as DOMRect;
  });
  if (mode === "paused" || mode === "anchor-top") body.dispatchEvent(new WheelEvent("wheel", { deltaY: -30 }));
  // Model a fallback DOM move clamping/resetting scrollTop before reflow.
  for (const target of [modal, sidebar]) {
    const append = target.appendChild.bind(target);
    vi.spyOn(target, "appendChild").mockImplementation(node => { scrollTop = 0; return append(node); });
  }
  const offset = bubble.getBoundingClientRect().top - 100;
  handle.moveTo(modal);
  expect(scrollTop).toBe(mode === "follow" ? 1100 : 770);
  if (mode !== "follow") expect(bubble.getBoundingClientRect().top - 100).toBe(offset);
  body.dispatchEvent(new Event("scroll"));
  handle.moveTo(sidebar);
  expect(scrollTop).toBe(mode === "follow" ? 900 : 450);
  body.dispatchEvent(new Event("scroll"));
  handle.moveTo(modal);
  expect(scrollTop).toBe(mode === "follow" ? 1100 : 770);
});
