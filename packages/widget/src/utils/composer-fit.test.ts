// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { composerRowFits, createComposerFitObserver, type ComposerFitSurface } from "./composer-fit";

const observers: ReturnType<typeof createComposerFitObserver>[] = [];
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function surface(width: number, startWidth = 80, endWidth = 40) {
  const form = document.createElement("form");
  form.style.cssText = "padding:8px;gap:8px";
  const input = document.createElement("textarea");
  const start = document.createElement("div");
  const end = document.createElement("div");
  let available = width;
  Object.defineProperty(form, "clientWidth", { get: () => available });
  for (const [rail, childWidth] of [[start, startWidth], [end, endWidth]] as const) {
    const button = document.createElement("button");
    Object.defineProperty(button, "scrollWidth", { get: () => childWidth });
    rail.append(button);
  }
  form.append(start, input, end);
  document.body.append(form);
  return { form, input, start, end, resize: (next: number) => { available = next; } };
}

function observe(getSurface: () => ComposerFitSurface | null, onMeasure = vi.fn()) {
  const observer = createComposerFitObserver({ getSurface, onMeasure });
  observers.push(observer);
  return observer;
}

describe("composer row width fit", () => {
  it("reserves usable editor width and has reversible width-only hysteresis", () => {
    expect(composerRowFits(255, 120, 8, true)).toBe(false);
    expect(composerRowFits(260, 120, 8, false)).toBe(false);
    expect(composerRowFits(272, 120, 8, false)).toBe(true);
    expect(composerRowFits(260, 120, 8, true)).toBe(true);
    expect(composerRowFits(0, 120, 8, true)).toBe(true);
  });

  it("distinguishes a crowded toolbar from a row that only lacks editor space", () => {
    const elements = surface(230, 140, 80);
    const observer = observe(() => ({ ...elements, resizeInput: false }));
    elements.input.style.height = "27px";
    expect(observer.measure()).toBe(false);
    expect(observer.toolbarCrowded()).toBe(true);
    elements.resize(260);
    observer.measure();
    expect(observer.toolbarCrowded()).toBe(false);
    expect(observer.measure()).toBe(false);
    expect(elements.input.style.height).toBe("27px");
    elements.resize(420);
    expect(observer.measure()).toBe(true);
    expect(observer.toolbarCrowded()).toBe(false);
  });

  it("measures children rather than a stretched/scrolling cluster", () => {
    const elements = surface(340);
    Object.defineProperty(elements.start, "scrollWidth", { get: () => 1000 });
    const observer = observe(() => elements);
    expect(observer.measure()).toBe(true);
    elements.resize(240);
    expect(observer.measure()).toBe(false);
    elements.resize(360);
    expect(observer.measure()).toBe(true);
  });

  it("includes child gaps, margins, long labels and live custom slot contents", () => {
    const elements = surface(340);
    elements.start.style.gap = "8px";
    const observer = observe(() => elements);
    expect(observer.measure()).toBe(true);
    const custom = document.createElement("button");
    custom.style.marginLeft = "4px";
    Object.defineProperty(custom, "scrollWidth", { get: () => 160 });
    elements.start.append(custom);
    expect(observer.measure()).toBe(false);
    custom.hidden = true;
    expect(observer.measure()).toBe(true);
  });

  it("keeps separate instances independent and disconnects on rebinding/destroy", () => {
    const disconnect = vi.fn();
    const callbacks: Array<() => void> = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { callbacks.push(callback); }
      observe() {}
      disconnect = disconnect;
    });
    const first = surface(340);
    const second = surface(240, 150, 40);
    let current = first;
    const a = observe(() => current);
    const b = observe(() => second);
    expect(a.measure()).toBe(true);
    expect(b.measure()).toBe(false);
    first.resize(200);
    expect(a.measure()).toBe(false);
    expect(b.measure()).toBe(false);
    current = surface(420);
    expect(a.measure()).toBe(true);
    expect(disconnect).toHaveBeenCalledOnce();
    a.destroy();
    b.destroy();
    expect(disconnect).toHaveBeenCalledTimes(3);
    expect(callbacks).toHaveLength(3);
  });

  it("schedules host and descendant changes without observing its temporary input-height writes", async () => {
    const frames: Array<(time: number) => void> = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    const elements = surface(340);
    const onMeasure = vi.fn();
    const observer = observe(() => elements, onMeasure);
    observer.measure();
    elements.input.style.height = "auto";
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    elements.start.firstElementChild!.textContent = "An updated model name";
    await Promise.resolve();
    window.dispatchEvent(new Event("resize"));
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(onMeasure).toHaveBeenCalledOnce();
    observer.destroy();
    window.dispatchEvent(new Event("resize"));
    expect(frames).toHaveLength(1);
  });
});
