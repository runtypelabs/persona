// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const footerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-footer")!;

const layoutOf = (mount: HTMLElement) =>
  footerOf(mount).getAttribute("data-persona-composer-layout");

describe("composer.layout", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("leaves the footer untouched when unset", async () => {
    const { mount } = makeController();
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it("leaves the footer untouched for the stacked default", async () => {
    const { mount } = makeController({ composer: { layout: "stacked" } });
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it("stamps single-row when configured", async () => {
    const { mount } = makeController({ composer: { layout: "single-row" } });
    await flush();
    expect(layoutOf(mount)).toBe("single-row");
  });

  it("keeps the compact attribute as the idle gate", async () => {
    const { mount } = makeController({ composer: { layout: "single-row" } });
    await flush();
    const footer = footerOf(mount);
    expect(footer.hasAttribute("data-persona-composer-compact")).toBe(true);

    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;
    textarea.value = "one\ntwo";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();

    // The layout stays declared; only the compact gate drops, so the CSS falls
    // back to the stacked card.
    expect(layoutOf(mount)).toBe("single-row");
    expect(footer.hasAttribute("data-persona-composer-compact")).toBe(false);
  });

  it("is ignored in composer-bar mount mode", async () => {
    const { mount } = makeController({
      launcher: { enabled: false, mountMode: "composer-bar" },
      composer: { layout: "single-row" },
    });
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it("follows a live update() in both directions", async () => {
    const { mount, controller } = makeController();
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);

    controller.update({ composer: { layout: "single-row" } } as never);
    await flush();
    expect(layoutOf(mount)).toBe("single-row");

    controller.update({ composer: { layout: "stacked" } } as never);
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it.each(["single-row", "stacked"] as const)("contains crowded %s controls and recovers on host resize", async (layout) => {
    const observers: Array<{ nodes: Element[]; callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("ResizeObserver", class {
      nodes: Element[] = [];
      disconnect = vi.fn();
      constructor(public callback: () => void) { observers.push(this); }
      observe(node: Element) { this.nodes.push(node); }
    });
    const frames: Array<(time: number) => void> = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    const { mount, controller } = makeController({ future: { v5Defaults: true }, composer: { layout } });
    const sibling = makeController({ composer: { layout: "single-row" } });
    await flush();
    frames.splice(0);
    const form = mount.querySelector<HTMLElement>("[data-persona-composer-form]")!;
    const input = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
    form.style.cssText = "padding:8px;gap:8px";
    input.style.lineHeight = "20px";
    let width = 90;
    Object.defineProperty(form, "clientWidth", { get: () => width });
    Object.defineProperty(input, "scrollHeight", { get: () => width < 200 ? 80 : 20 });
    for (const node of Array.from(form.querySelectorAll<HTMLElement>(".persona-widget-composer__left-actions > *, .persona-widget-composer__right-actions > *"))) {
      Object.defineProperty(node, "scrollWidth", { get: () => 160 });
    }
    const observer = observers.find((item) => item.nodes.includes(form))!;
    const resize = () => { observer.callback(); frames.splice(0).forEach((frame) => frame(0)); };
    resize();
    expect(footerOf(mount).hasAttribute("data-persona-composer-fit")).toBe(layout === "stacked");
    expect(footerOf(mount).hasAttribute("data-persona-composer-crowded")).toBe(true);
    expect(footerOf(mount).hasAttribute("data-persona-composer-expanded")).toBe(true);
    expect(footerOf(sibling.mount).hasAttribute("data-persona-composer-fit")).toBe(true);
    input.value = "short";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    width = 420;
    resize();
    expect(footerOf(mount).hasAttribute("data-persona-composer-fit")).toBe(true);
    expect(footerOf(mount).hasAttribute("data-persona-composer-compact")).toBe(true);
    expect(footerOf(mount).hasAttribute("data-persona-composer-expanded")).toBe(layout === "stacked");
    expect(footerOf(mount).hasAttribute("data-persona-composer-crowded")).toBe(false);
    controller.destroy();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
