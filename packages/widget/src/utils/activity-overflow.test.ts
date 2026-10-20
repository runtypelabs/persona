// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActivityOverflow } from "./activity-overflow";

let resize: ResizeObserverCallback;
const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
class Observer {
  constructor(callback: ResizeObserverCallback) { resize = callback; }
  observe = observe; unobserve = unobserve; disconnect = disconnect;
}
const dimensions = (el: HTMLElement, height: number, total: number, top = 0) => {
  Object.defineProperties(el, { clientHeight: { configurable: true, value: height }, scrollHeight: { configurable: true, value: total } });
  el.scrollTop = top;
};
const entry = (target: Element): ResizeObserverEntry => ({ target, contentRect: new DOMRectReadOnly(), borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] });
const edges = (el: HTMLElement) => [el.hasAttribute("data-persona-scroll-top"), el.hasAttribute("data-persona-scroll-bottom")];
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("activity detail overflow lifecycle", () => {
  it("tracks both edges independently with a one-pixel tolerance, and keyboard focus only for overflow", () => {
    const root = document.createElement("div"), el = document.createElement("div");
    el.className = "persona-activity-scroll"; root.append(el);
    const lifecycle = createActivityOverflow(root);
    for (const [height, total, top, expected] of [
      [100, 100, 0, [false, false]], [100, 101, 0, [false, false]],
      [100, 200, 0, [false, true]], [100, 200, 50, [true, true]],
      [100, 200, 99.5, [true, false]], [100, 200, -2, [false, true]],
      [0, 200, 0, [false, false]],
    ] as const) {
      dimensions(el, height, total, top); lifecycle.sync();
      expect(edges(el)).toEqual(expected);
      expect(el.tabIndex).toBe(expected.some(Boolean) ? 0 : -1);
    }
    lifecycle.destroy();
  });

  it("refreshes after streaming morphs, delegated scroll, resize, and live cap changes; prunes and destroys observers", () => {
    vi.stubGlobal("ResizeObserver", Observer);
    const root = document.createElement("div"), request = document.createElement("pre"), response = document.createElement("pre");
    request.className = response.className = "persona-activity-scroll";
    root.append(request, response); document.body.append(root);
    const lifecycle = createActivityOverflow(root);
    dimensions(request, 100, 300); dimensions(response, 100, 70);
    lifecycle.sync();
    expect(observe).toHaveBeenCalledTimes(2);
    expect(edges(request)).toEqual([false, true]); expect(edges(response)).toEqual([false, false]);
    response.textContent = "Streamed output"; dimensions(response, 100, 250);
    lifecycle.sync(); expect(edges(response)).toEqual([false, true]);
    response.scrollTop = 150; response.dispatchEvent(new Event("scroll"));
    expect(edges(response)).toEqual([true, false]);
    dimensions(response, 250, 250);
    resize([entry(response)], {} as ResizeObserver);
    expect(edges(response)).toEqual([false, false]);
    dimensions(request, 300, 300); resize([entry(request)], {} as ResizeObserver);
    expect(edges(request)).toEqual([false, false]);
    request.remove(); observe.mockClear(); lifecycle.sync(); expect(observe).toHaveBeenCalledOnce(); expect(observe).toHaveBeenCalledWith(response);
    const disconnects = disconnect.mock.calls.length; lifecycle.destroy(); expect(disconnect).toHaveBeenCalledTimes(disconnects + 1);
    dimensions(response, 100, 250); response.dispatchEvent(new Event("scroll")); window.dispatchEvent(new Event("resize"));
    expect(edges(response)).toEqual([false, false]);
  });
});
