// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, SlotRenderContext } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const make = (config: Partial<AgentWidgetConfig> = {}) => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "/dispatch", launcher: { enabled: false }, persistState: false,
    ...config,
  });
  controllers.push(controller);
  return { mount, controller };
};
const node = (text: string) => {
  const el = document.createElement("div");
  el.textContent = text;
  return el;
};
beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("host layout slots", () => {
  it("updates a retained lifetime, swaps its output, restores null and cleans up once", () => {
    let context!: SlotRenderContext;
    const first = node("first");
    const second = node("second");
    const destroy = vi.fn();
    const update = vi.fn().mockReturnValueOnce(second).mockReturnValueOnce(null);
    const renderer = vi.fn((ctx: SlotRenderContext) => {
      context = ctx;
      return { element: first, update, destroy };
    });
    const { mount, controller } = make({ layout: { slots: { "footer-top": renderer } } });
    const original = context.defaultContent()!;
    expect(first.isConnected).toBe(true);
    controller.update({ copy: { inputPlaceholder: "Updated" } });
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].signal).toBe(context.signal);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    controller.update({});
    expect(second.isConnected).toBe(false);
    expect(mount.contains(original)).toBe(true);
    expect(context.signal.aborted).toBe(false);
    controller.update({ layout: { slots: { "footer-top": undefined } } });
    expect(context.signal.aborted).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
    controller.destroy();
    controllers.pop();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("never removes core DOM returned from unsupported slots", () => {
    let messages!: HTMLElement;
    let composer!: HTMLElement;
    const { mount, controller } = make({ layout: { slots: {
      messages: ({ defaultContent }) => { messages = defaultContent()!; return messages; },
      composer: ({ defaultContent }) => { composer = defaultContent()!; return composer; },
    } } });
    controller.update({ layout: { slots: { messages: undefined, composer: undefined } } });
    expect(mount.contains(messages)).toBe(true);
    expect(mount.contains(composer)).toBe(true);
    expect(controller.setMessage("Still usable")).toBe(true);
  });

  it("restores default content moved into a legacy wrapper", () => {
    let original!: HTMLElement;
    const { mount, controller } = make({ layout: { slots: {
      "body-top": ({ defaultContent }) => {
        original = defaultContent()!;
        const el = node("custom");
        el.append(original);
        return el;
      },
    } } });
    expect(mount.contains(original)).toBe(true);
    controller.update({ layout: { slots: { "body-top": undefined } } });
    expect(original.parentElement?.id).toBe("persona-scroll-container");
  });

  it("places constrained transcript content and composer positions independently", () => {
    const transcript = node("transcript");
    const start = node("start");
    const end = node("end");
    const beforeSend = node("before-send");
    const { controller } = make({ layout: { contentMaxWidth: "600px", slots: {
      "transcript-top": () => transcript,
      "composer-start": () => start,
      "composer-end": () => end,
      "composer-before-send": () => beforeSend,
    } } });
    const host = transcript.parentElement!;
    expect(host.dataset.personaLayoutSlot).toBe("transcript-top");
    expect(host.style.maxWidth).toContain("--persona-content-max-width");
    expect((host.nextElementSibling as HTMLElement).style.maxWidth).toBe("600px");
    expect(start.parentElement?.parentElement?.hasAttribute("data-persona-composer-actions-start")).toBe(true);
    expect(end.parentElement?.parentElement?.hasAttribute("data-persona-composer-actions-end")).toBe(true);
    expect(beforeSend.parentElement?.nextElementSibling?.querySelector("button")).toBeTruthy();
    const other = make({ layout: { slots: { "transcript-top": () => node("other") } } });
    controller.update({ layout: { slots: { "transcript-top": undefined } } });
    expect(transcript.isConnected).toBe(false);
    expect(other.mount.textContent).toContain("other");
  });

  it("remounts composer slots across a composer rebuild without ending lifetimes", () => {
    let signal!: AbortSignal;
    const destroy = vi.fn();
    const el = node("host action");
    const replacement = node("host suggestions");
    const update = vi.fn();
    const { mount, controller } = make({ layout: { slots: {
      "composer-start": (ctx) => { signal = ctx.signal; return { element: el, update, destroy }; },
      "footer-top": () => replacement,
    } } });
    const previousParent = el.parentElement;
    controller.update({ contextMentions: { enabled: false } });
    expect(mount.contains(el)).toBe(true);
    expect(mount.contains(replacement)).toBe(true);
    expect(el.parentElement).not.toBe(previousParent);
    expect(update).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("keeps a renderer alive while its host is temporarily detached", () => {
    let signal!: AbortSignal;
    const destroy = vi.fn();
    const el = node("alive");
    const { mount, controller } = make({ layout: { slots: { "transcript-top": (ctx) => {
      signal = ctx.signal;
      return { element: el, destroy };
    } } } });
    mount.remove();
    controller.update({});
    expect(signal.aborted).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
    document.body.append(mount);
    controller.destroy();
    controllers.pop();
    expect(signal.aborted).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("host link routing", () => {
  const anchorIn = (mount: HTMLElement, href = "/route") => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.append(node("open"));
    mount.querySelector("[id^=persona-scroll-container]")!.append(anchor);
    return anchor;
  };
  const click = (anchor: HTMLAnchorElement, options: ConstructorParameters<typeof MouseEvent>[1] = {}) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...options });
    anchor.firstElementChild!.dispatchEvent(event);
    return event;
  };
  it("cancels ordinary navigation per instance and reads updated callbacks", () => {
    const route = vi.fn((ctx) => ctx.preventDefault());
    const first = make({ onLinkClick: route });
    const otherRoute = vi.fn((ctx) => ctx.preventDefault());
    const second = make({ onLinkClick: otherRoute });
    const anchor = anchorIn(first.mount);
    expect(click(anchor).defaultPrevented).toBe(true);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0][0].url).toBe(anchor.href);
    expect(otherRoute).not.toHaveBeenCalled();
    const replacement = vi.fn((ctx) => ctx.preventDefault());
    first.controller.update({ onLinkClick: replacement });
    click(anchor);
    expect(replacement).toHaveBeenCalledTimes(1);
    click(anchorIn(second.mount));
    expect(otherRoute).toHaveBeenCalledTimes(1);
  });
  it("does not route links through an outer instance or retain listeners after destroy", () => {
    const outerRoute = vi.fn();
    const outer = make({ onLinkClick: outerRoute });
    const innerRoute = vi.fn((ctx) => ctx.preventDefault());
    const inner = make({ onLinkClick: innerRoute });
    outer.mount.querySelector("[id^=persona-scroll-container]")!.append(inner.mount);
    const anchor = anchorIn(inner.mount);
    click(anchor);
    expect(innerRoute).toHaveBeenCalledTimes(1);
    expect(outerRoute).not.toHaveBeenCalled();
    inner.controller.destroy();
    controllers.pop();
    inner.mount.append(anchor);
    click(anchor);
    expect(innerRoute).toHaveBeenCalledTimes(1);
    expect(outerRoute).not.toHaveBeenCalled();
  });

  it("preserves modified, download, external-target and unsafe URL behavior", () => {
    const route = vi.fn();
    const { mount } = make({ onLinkClick: route });
    const anchor = anchorIn(mount);
    for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) click(anchor, { [key]: true });
    click(anchor, { button: 1 });
    anchor.download = "file";
    click(anchor);
    anchor.removeAttribute("download");
    anchor.target = "_blank";
    click(anchor);
    anchor.target = "";
    anchor.href = "javascript:void(0)";
    click(anchor);
    expect(route).not.toHaveBeenCalled();
  });
});

describe("host composer modes", () => {
  it("validates groups and unknown ids, updates placeholder, and isolates instances", () => {
    const composer = {
      modes: [
        { id: "search", label: "Search", groupId: "task", placeholder: "Search here" },
        { id: "code", label: "Code", groupId: "task", placeholder: "Write code" },
        { id: "short", label: "Short" },
      ],
      modeGroups: [{ id: "task", selection: "single" as const }],
      defaultActiveModeIds: ["search"],
    };
    const first = make({ composer });
    const second = make({ composer });
    first.controller.setComposerModes(["unknown", "search", "code", "short", "short"]);
    expect(first.controller.getComposerState().activeModeIds).toEqual(["code", "short"]);
    expect(first.mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")?.placeholder).toBe("Write code");
    expect(second.controller.getComposerState().activeModeIds).toEqual(["search"]);
    first.controller.update({ composer: { defaultActiveModeIds: ["search"] } });
    expect(first.controller.getComposerState().activeModeIds).toEqual(["code", "short"]);
    first.controller.setComposerModes(["search", "code", "search"]);
    expect(first.controller.getComposerState().activeModeIds).toEqual(["search"]);
    first.controller.setComposerModes([]);
    expect(first.controller.getComposerState().activeModeIds).toEqual([]);
  });
});
