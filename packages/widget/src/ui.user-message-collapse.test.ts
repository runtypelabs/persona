// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { mergeWithDefaults } from "./defaults";
import {
  DEFAULT_USER_MESSAGE_COLLAPSE_MAX_HEIGHT,
  userMessageOverflows,
} from "./components/user-message-collapse";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

type RafCallback = (time: number) => void;

const CREATED_AT = "2026-03-29T00:00:00.000Z";
const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long pasted message.`).join("\n\n");

const installRafMock = () => {
  let nextId = 1;
  let now = performance.now();
  const callbacks = new Map<number, RafCallback>();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: RafCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });
  return {
    step(frameCount = 1) {
      let frames = 0;
      while (callbacks.size > 0 && frames < frameCount) {
        const pending = [...callbacks.values()];
        callbacks.clear();
        frames += 1;
        now += 16;
        pending.forEach((callback) => callback(now));
      }
    },
    flush(maxFrames = 80) {
      let frames = 0;
      while (callbacks.size > 0 && frames < maxFrames) {
        const pending = [...callbacks.values()];
        callbacks.clear();
        frames += 1;
        now += 16;
        pending.forEach((callback) => callback(now));
      }
    },
  };
};

const installResizeObserverMock = () => {
  const triggers: Array<() => void> = [];
  class ResizeObserverMock {
    constructor(callback: (entries: unknown[], observer: unknown) => void) {
      triggers.push(() => callback([], this));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  return { trigger: () => triggers.forEach((fire) => fire()) };
};

// jsdom has no layout. Collapse regions report a per-message natural height
// (what the browser would measure for the rendered markdown and attachments);
// every other element keeps jsdom's 0, and the scroll container overrides it.
const naturalHeights = new Map<string, number>();
const originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight")!;
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute("data-persona-user-collapse")) {
        const id = this.closest("[data-message-id]")?.getAttribute("data-message-id") ?? "";
        return naturalHeights.get(id) ?? 0;
      }
      return originalScrollHeight.get!.call(this);
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  naturalHeights.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const installScrollMetrics = (element: HTMLElement, initial: { scrollHeight: number; clientHeight: number }) => {
  let scrollTop = 0;
  let scrollHeight = initial.scrollHeight;
  const clientHeight = initial.clientHeight;
  Object.defineProperties(element, {
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(value, Math.max(0, scrollHeight - clientHeight)));
      },
    },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => clientHeight },
  });
  return {
    getScrollTop: () => scrollTop,
    getBottomScrollTop: () => Math.max(0, scrollHeight - clientHeight),
    setScrollTop: (value: number) => { element.scrollTop = value; },
    setScrollHeight: (value: number) => {
      scrollHeight = value;
      if (scrollTop > scrollHeight - clientHeight) scrollTop = Math.max(0, scrollHeight - clientHeight);
    },
  };
};

const mountWidget = (config: Partial<AgentWidgetConfig> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    ...config,
    features: { userMessageCollapse: { enabled: true }, ...config.features },
  } as AgentWidgetConfig);
  return { mount, controller };
};

const emit = (
  controller: ReturnType<typeof createAgentExperience>,
  message: Partial<AgentWidgetMessage> & Pick<AgentWidgetMessage, "id" | "role">
) => {
  controller.injectTestMessage({
    type: "message",
    message: { content: "", createdAt: CREATED_AT, ...message } as AgentWidgetMessage,
  });
};

const emitUser = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  height: number,
  extra: Partial<AgentWidgetMessage> = {}
) => {
  naturalHeights.set(id, height);
  emit(controller, { id, role: "user", content: LONG_TEXT, ...extra });
};

const region = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLElement>(`[data-message-id="${id}"] [data-persona-user-collapse]`);
const toggle = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(`[data-message-id="${id}"] button[data-persona-user-collapse-toggle]`);

describe("userMessageOverflows", () => {
  it("leaves content within two lines of the limit expanded", () => {
    expect(userMessageOverflows(240, 240)).toBe(false);
    expect(userMessageOverflows(288, 240)).toBe(false);
    expect(userMessageOverflows(289, 240)).toBe(true);
  });
});

describe("long user message collapse", () => {
  it("adds no toggle under the threshold", () => {
    installRafMock();
    const { mount, controller } = mountWidget();
    emitUser(controller, "short", 200);
    expect(region(mount, "short")?.getAttribute("data-persona-user-collapse")).toBe("fit");
    expect(toggle(mount, "short")).toBeNull();
    controller.destroy();
  });

  it("collapses over the threshold with a labelled, controlling toggle", () => {
    installRafMock();
    const { mount, controller } = mountWidget();
    emitUser(controller, "long", 900);
    const clip = region(mount, "long")!;
    const button = toggle(mount, "long")!;
    expect(clip.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    expect(clip.style.getPropertyValue("--persona-user-collapse-max-height")).toBe(`${DEFAULT_USER_MESSAGE_COLLAPSE_MAX_HEIGHT}px`);
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Show more");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(clip.id);
    expect(mount.querySelector(`#${clip.id}`)).toBe(clip);
    // The whole message stays in the DOM: no truncation, no nested scroller.
    expect(clip.textContent).toContain("Line 40 of a long pasted message.");
    expect(clip.hasAttribute("tabindex")).toBe(false);
    controller.destroy();
  });

  it("honors a custom maxHeight and localized labels", () => {
    installRafMock();
    const { mount, controller } = mountWidget({
      features: { userMessageCollapse: { enabled: true, maxHeight: 120 } },
      copy: { showMoreLabel: "Mehr anzeigen", showLessLabel: "Weniger anzeigen" },
    });
    emitUser(controller, "custom", 200);
    expect(region(mount, "custom")!.style.getPropertyValue("--persona-user-collapse-max-height")).toBe("120px");
    toggle(mount, "custom")!.click();
    expect(toggle(mount, "custom")!.textContent).toBe("Weniger anzeigen");
    toggle(mount, "custom")!.click();
    expect(toggle(mount, "custom")!.textContent).toBe("Mehr anzeigen");
    controller.destroy();
  });

  it("expands and collapses on toggle, keeping the same button", () => {
    installRafMock();
    const { mount, controller } = mountWidget();
    emitUser(controller, "toggle", 900);
    const button = toggle(mount, "toggle")!;
    button.click();
    expect(region(mount, "toggle")!.getAttribute("data-persona-user-collapse")).toBe("expanded");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toBe("Show less");
    button.click();
    expect(region(mount, "toggle")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toBe("Show more");
    controller.destroy();
  });

  it("expands when keyboard focus lands inside the clipped content", () => {
    installRafMock();
    const { mount, controller } = mountWidget();
    emitUser(controller, "focus", 900);
    const content = region(mount, "focus")!.querySelector<HTMLElement>(".persona-message-content")!;
    content.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(region(mount, "focus")!.getAttribute("data-persona-user-collapse")).toBe("expanded");
    expect(toggle(mount, "focus")!.getAttribute("aria-expanded")).toBe("true");
    // Focusing the toggle itself (outside the region) changes nothing.
    toggle(mount, "focus")!.click();
    toggle(mount, "focus")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(region(mount, "focus")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    controller.destroy();
  });

  it("applies maxHeight and label changes from update() to rendered bubbles", () => {
    installRafMock();
    const { mount, controller } = mountWidget();
    emitUser(controller, "updated", 900);
    emit(controller, { id: "reply", role: "assistant", content: "Reply" });
    controller.update({
      features: { userMessageCollapse: { enabled: true, maxHeight: 300 } },
      copy: { showMoreLabel: "Expand", showLessLabel: "Shrink" },
    });
    expect(region(mount, "updated")!.style.getPropertyValue("--persona-user-collapse-max-height")).toBe("300px");
    expect(toggle(mount, "updated")!.textContent).toBe("Expand");
    // Raised past the content height, the bubble no longer collapses at all.
    controller.update({ features: { userMessageCollapse: { enabled: true, maxHeight: 1000 } } });
    expect(region(mount, "updated")!.getAttribute("data-persona-user-collapse")).toBe("fit");
    expect(toggle(mount, "updated")).toBeNull();
    controller.destroy();
  });

  it("keeps the reader's choice across streaming re-renders and morphs", () => {
    const raf = installRafMock();
    const { mount, controller } = mountWidget();
    controller.injectTestMessage({ type: "status", status: "connecting" });
    emitUser(controller, "kept", 900);
    toggle(mount, "kept")!.click();
    for (const content of ["Streaming", "Streaming a longer reply", "Streaming a much longer reply"]) {
      emit(controller, { id: "reply", role: "assistant", content, streaming: true });
      raf.flush();
    }
    emit(controller, { id: "reply", role: "assistant", content: "Done" });
    // A re-render of the user message itself (same id) must not re-collapse it.
    emitUser(controller, "kept", 900, { content: `${LONG_TEXT}\n\nEdited.` });
    raf.flush();
    expect(region(mount, "kept")!.getAttribute("data-persona-user-collapse")).toBe("expanded");
    expect(toggle(mount, "kept")!.getAttribute("aria-expanded")).toBe("true");
    expect(toggle(mount, "kept")!.textContent).toBe("Show less");

    // And a collapsed choice is not re-expanded either.
    toggle(mount, "kept")!.click();
    emit(controller, { id: "reply-2", role: "assistant", content: "Another reply" });
    raf.flush();
    expect(region(mount, "kept")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    controller.destroy();
  });

  it("keeps an interim voice transcript expanded, then collapses it once final", () => {
    const raf = installRafMock();
    const { mount, controller } = mountWidget();
    emitUser(controller, "voice", 400, { content: "So what I was thinking", voiceProcessing: true });
    expect(region(mount, "voice")!.getAttribute("data-persona-user-collapse")).toBe("live");
    expect(toggle(mount, "voice")).toBeNull();
    // The same id keeps growing while the speaker talks.
    emitUser(controller, "voice", 900, { voiceProcessing: true });
    raf.flush();
    expect(region(mount, "voice")!.getAttribute("data-persona-user-collapse")).toBe("live");
    expect(toggle(mount, "voice")).toBeNull();
    emitUser(controller, "voice", 900, { voiceProcessing: false });
    raf.flush();
    expect(region(mount, "voice")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    expect(toggle(mount, "voice")!.getAttribute("aria-expanded")).toBe("false");
    controller.destroy();
  });

  it("does not move an engaged reader's viewport when a final transcript collapses", () => {
    const raf = installRafMock();
    const { mount, controller } = mountWidget({ features: { scrollBehavior: { mode: "follow" } } });
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    const metrics = installScrollMetrics(body, { scrollHeight: 2000, clientHeight: 400 });
    emitUser(controller, "voice-read", 900, { voiceProcessing: true });
    raf.flush();
    // The reader scrolls up into the transcript: follow pauses.
    body.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, bubbles: true }));
    metrics.setScrollTop(500);
    body.dispatchEvent(new Event("scroll"));
    raf.flush();
    const bubble = mount.querySelector<HTMLElement>('[data-message-id="voice-read"]')!;
    // The bubble is in view at 100px; collapsing must hold its top there.
    let top = 100;
    vi.spyOn(bubble, "getBoundingClientRect").mockImplementation(() => ({ top, bottom: top + 300 } as DOMRect));
    emitUser(controller, "voice-read", 900, { voiceProcessing: false });
    raf.flush();
    expect(region(mount, "voice-read")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    expect(metrics.getScrollTop()).toBe(500);
    top = 0;
    controller.destroy();
  });

  it("holds the content below when a final transcript above the viewport collapses", () => {
    const raf = installRafMock();
    const { mount, controller } = mountWidget({ features: { scrollBehavior: { mode: "follow" } } });
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    // The transcript bubble sits at the top of the content; the reader has
    // scrolled 700px down, past most of it, into what follows.
    let scrollTop = 0;
    const bubbleHeight = () =>
      region(mount, "voice-above")?.getAttribute("data-persona-user-collapse") === "collapsed" ? 270 : 900;
    const scrollHeight = () => bubbleHeight() + 1100;
    Object.defineProperties(body, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = Math.max(0, Math.min(value, scrollHeight() - 400)); },
      },
      scrollHeight: { configurable: true, get: scrollHeight },
      clientHeight: { configurable: true, get: () => 400 },
    });
    emitUser(controller, "voice-above", 900, { voiceProcessing: true });
    raf.flush();
    const bubble = mount.querySelector<HTMLElement>('[data-message-id="voice-above"]')!;
    vi.spyOn(bubble, "getBoundingClientRect").mockImplementation(() =>
      ({ top: -scrollTop, bottom: bubbleHeight() - scrollTop } as DOMRect));
    body.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, bubbles: true }));
    body.scrollTop = 700;
    body.dispatchEvent(new Event("scroll"));
    raf.flush();
    emitUser(controller, "voice-above", 900, { voiceProcessing: false });
    raf.flush();
    expect(region(mount, "voice-above")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    // The bubble's bottom edge (200px above the viewport) stays where it was:
    // 900 - 700 = 200 before, 270 - 70 = 200 after.
    expect(scrollTop).toBe(70);
    controller.destroy();
  });

  it("treats a toggle as reader intent: follow pauses and later renders leave the viewport", () => {
    const raf = installRafMock();
    const resize = installResizeObserverMock();
    const { mount, controller } = mountWidget({ features: { scrollBehavior: { mode: "follow" } } });
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    const metrics = installScrollMetrics(body, { scrollHeight: 1000, clientHeight: 400 });
    controller.injectTestMessage({ type: "status", status: "connecting" });
    emitUser(controller, "intent", 900);
    emit(controller, { id: "reply", role: "assistant", content: "Streaming", streaming: true });
    raf.flush();
    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    metrics.setScrollTop(300);
    toggle(mount, "intent")!.click();
    for (const height of [1400, 1800]) {
      metrics.setScrollHeight(height);
      emit(controller, { id: "reply", role: "assistant", content: `Streaming ${height}`, streaming: true });
      resize.trigger();
      raf.flush();
      expect(metrics.getScrollTop()).toBe(300);
    }
    expect(mount.querySelector("[data-persona-scroll-to-bottom]")?.getAttribute("data-persona-scroll-to-bottom-visible")).toBe("true");
    controller.destroy();
  });

  it("brings a bubble whose top scrolled away back to the anchor offset on Show less", () => {
    const raf = installRafMock();
    const { mount, controller } = mountWidget({ features: { scrollBehavior: { mode: "follow" } } });
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    let scrollTop = 0;
    const collapsed = () => region(mount, "far")?.getAttribute("data-persona-user-collapse") === "collapsed";
    const scrollHeight = () => (collapsed() ? 270 : 900) + 1100;
    Object.defineProperties(body, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = Math.max(0, Math.min(value, scrollHeight() - 400)); },
      },
      scrollHeight: { configurable: true, get: scrollHeight },
      clientHeight: { configurable: true, get: () => 400 },
    });
    // The bubble starts 100px into the content.
    emitUser(controller, "far", 900);
    raf.flush();
    const bubble = mount.querySelector<HTMLElement>('[data-message-id="far"]')!;
    vi.spyOn(bubble, "getBoundingClientRect").mockImplementation(() =>
      ({ top: 100 - scrollTop, bottom: 100 - scrollTop + (collapsed() ? 270 : 900) } as DOMRect));
    toggle(mount, "far")!.click();
    // The reader reads down to the Show less button at the bubble's bottom.
    body.scrollTop = 700;
    toggle(mount, "far")!.click();
    expect(collapsed()).toBe(true);
    // Top lands 16px below the viewport top: 100 - 84 = 16.
    expect(scrollTop).toBe(84);
    controller.destroy();
  });

  it("leaves the anchor-top pin, its spacer, and jump-to-latest intact", () => {
    const raf = installRafMock();
    const resize = installResizeObserverMock();
    const { mount, controller } = mountWidget({
      features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } },
    });
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    const spacer = body.querySelector<HTMLElement>("[data-persona-anchor-spacer]")!;
    // As in a browser, the scroll height counts the spacer, and the content
    // grows by 660px while the 900px message is expanded (300px collapsed).
    let replyHeight = 0;
    let scrollTop = 0;
    const isExpanded = () => region(mount, "anchored")?.getAttribute("data-persona-user-collapse") === "expanded";
    const bubbleHeight = () => (isExpanded() ? 960 : 300);
    const scrollHeight = () =>
      1000 + (isExpanded() ? 660 : 0) + replyHeight +
      (spacer.style.display === "none" ? 0 : parseFloat(spacer.style.height) || 0);
    Object.defineProperties(body, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = Math.max(0, Math.min(value, scrollHeight() - 400)); },
      },
      scrollHeight: { configurable: true, get: scrollHeight },
      clientHeight: { configurable: true, get: () => 400 },
    });
    controller.injectTestMessage({ type: "status", status: "connecting" });
    emitUser(controller, "anchored", 900);
    // Collapsed on send, before the anchor frame measures the layout.
    expect(region(mount, "anchored")!.getAttribute("data-persona-user-collapse")).toBe("collapsed");
    const bubble = mount.querySelector<HTMLElement>('[data-message-id="anchored"]')!;
    Object.defineProperty(bubble, "offsetTop", { value: 700 });
    vi.spyOn(bubble, "offsetHeight", "get").mockImplementation(bubbleHeight);
    // Pinned 16px below the viewport top once the anchor ease lands.
    vi.spyOn(bubble, "getBoundingClientRect").mockImplementation(() => {
      const top = 700 - scrollTop;
      return { top, bottom: top + bubbleHeight() } as DOMRect;
    });
    raf.step(1);
    // target = 700 - 16 = 684; spacer = 684 + 400 - 1000 + 24 slack = 108.
    expect(spacer.style.height).toBe("108px");
    raf.flush();
    expect(scrollTop).toBe(684);

    // Expanding holds the pinned bubble's top at the anchor offset; the
    // grown content now covers the viewport, so the spacer gives its room back.
    toggle(mount, "anchored")!.click();
    raf.flush();
    expect(scrollTop).toBe(684);
    expect(spacer.style.height).toBe("0px");
    // Collapsing re-reserves the spacer so the shrink can't clamp scrollTop.
    toggle(mount, "anchored")!.click();
    raf.flush();
    expect(scrollTop).toBe(684);
    expect(spacer.style.height).toBe("108px");

    // The reply streams in under the pin, and jump-to-latest still drops the anchor.
    emit(controller, { id: "reply", role: "assistant", content: "Streaming", streaming: true });
    replyHeight = 600;
    resize.trigger();
    raf.flush();
    expect(scrollTop).toBe(684);
    expect(spacer.style.height).toBe("0px");
    const jump = mount.querySelector<HTMLButtonElement>("[data-persona-scroll-to-bottom]")!;
    expect(jump.getAttribute("data-persona-scroll-to-bottom-visible")).toBe("true");
    jump.click();
    raf.flush();
    expect(spacer.style.display).toBe("none");
    expect(scrollTop).toBe(scrollHeight() - 400);
    controller.destroy();
  });

  it("leaves a custom renderUserMessage bubble untouched", () => {
    installRafMock();
    const { mount, controller } = mountWidget({
      layout: {
        messages: {
          renderUserMessage: ({ message }) => {
            const el = document.createElement("div");
            el.className = "custom-user";
            el.setAttribute("data-message-id", message.id);
            el.textContent = message.content;
            return el;
          },
        },
      },
    });
    emitUser(controller, "custom-render", 900);
    const custom = mount.querySelector<HTMLElement>(".custom-user")!;
    expect(custom.textContent).toBe(LONG_TEXT);
    expect(custom.querySelector("[data-persona-user-collapse]")).toBeNull();
    expect(mount.querySelector("button[data-persona-user-collapse-toggle]")).toBeNull();
    controller.destroy();
  });

  it("is off by default in V4 and on under future.v5Defaults", () => {
    installRafMock();
    expect(mergeWithDefaults({}).features?.userMessageCollapse).toBeUndefined();
    expect(mergeWithDefaults({ future: { v5Defaults: true } }).features?.userMessageCollapse).toEqual({ enabled: true });
    // A partial override keeps the V5 enable flag.
    expect(mergeWithDefaults({
      future: { v5Defaults: true }, features: { userMessageCollapse: { maxHeight: 300 } },
    }).features?.userMessageCollapse).toEqual({ enabled: true, maxHeight: 300 });

    for (const v5Defaults of [false, true]) {
      const mount = document.createElement("div");
      document.body.appendChild(mount);
      const controller = createAgentExperience(mount, mergeWithDefaults({
        apiUrl: "https://api.example.com/chat", launcher: { enabled: false }, persistState: false,
        future: { v5Defaults },
      }) as AgentWidgetConfig);
      emitUser(controller, `default-${v5Defaults}`, 900);
      expect(Boolean(toggle(mount, `default-${v5Defaults}`))).toBe(v5Defaults);
      expect(Boolean(region(mount, `default-${v5Defaults}`))).toBe(v5Defaults);
      controller.destroy();
    }
  });
});
