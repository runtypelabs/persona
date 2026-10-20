// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { delayInstallLoading } from "./install-loading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

it("never inserts feedback when loading completes before 300ms", () => {
  const stop = delayInstallLoading(document.body);
  vi.advanceTimersByTime(299);
  expect(document.querySelector("[role=status]")).toBeNull();
  stop();
  vi.runAllTimers();
  expect(document.querySelector("[role=status]")).toBeNull();
  expect(document.body.hasAttribute("aria-busy")).toBe(false);
});

it("adds feedback without replacing content and restores host state on cleanup", () => {
  const target = document.createElement("button");
  target.textContent = "Open chat";
  target.style.position = "static";
  target.setAttribute("aria-busy", "false");
  document.body.append(target);
  const stop = delayInstallLoading(target, true);
  vi.advanceTimersByTime(300);
  expect(target.getAttribute("aria-busy")).toBe("true");
  expect(target.firstChild?.textContent).toBe("Open chat");
  expect(target.querySelector("[role=status]")?.getAttribute("aria-label")).toBe("Loading assistant");
  expect(target.style.position).toBe("relative");
  stop();
  expect(target.textContent).toBe("Open chat");
  expect(target.getAttribute("aria-busy")).toBe("false");
  expect(target.style.position).toBe("static");
});

it("does not mutate disconnected targets or overwrite a host position change", () => {
  const target = document.createElement("div");
  const stop = delayInstallLoading(target);
  vi.advanceTimersByTime(300);
  expect(target.children).toHaveLength(0);
  stop();
  document.body.append(target);
  const done = delayInstallLoading(target);
  vi.advanceTimersByTime(300);
  target.style.position = "fixed";
  done();
  expect(target.style.position).toBe("fixed");
});

it("does not invoke a custom renderer for a fast load", () => {
  const render = vi.fn();
  const stop = delayInstallLoading(document.body, false, render);
  vi.advanceTimersByTime(299);
  stop();
  vi.runAllTimers();
  expect(render).not.toHaveBeenCalled();
});

for (const launcher of [false, true]) {
  it(`owns the custom container and runs cleanup once (launcher: ${launcher})`, () => {
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = vi.fn();
    const render = vi.fn(({ container, target: host, kind }) => {
      expect(container.isConnected).toBe(true);
      expect(host).toBe(target);
      expect(kind).toBe(launcher ? "launcher" : "embedded");
      container.textContent = "Preparing…";
      return cleanup;
    });
    const stop = delayInstallLoading(target, launcher, render);
    vi.advanceTimersByTime(300);
    expect(render).toHaveBeenCalledOnce();
    expect(target.querySelector('[data-persona-loading="default"]')).toBeNull();
    expect(target.textContent).toBe("Preparing…");
    stop(); stop();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(target.childElementCount).toBe(0);
    expect(target.hasAttribute("aria-busy")).toBe(false);
  });
}

it("falls back to the default ring when rendering throws", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const stop = delayInstallLoading(document.body, false, ({ container }) => {
    container.textContent = "Partial loading UI";
    container.remove();
    throw new Error("render failed");
  });
  vi.advanceTimersByTime(300);
  expect(document.querySelector('[data-persona-loading="default"]')).not.toBeNull();
  expect(document.body.textContent).toBe("");
  stop();
  expect(document.body.childElementCount).toBe(0);
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});

it("still removes the container when custom cleanup throws", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const stop = delayInstallLoading(document.body, false, () => () => { throw new Error("cleanup failed"); });
  vi.advanceTimersByTime(300);
  stop(); stop();
  expect(document.querySelector("[role=status]")).toBeNull();
  expect(document.body.hasAttribute("aria-busy")).toBe(false);
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});
