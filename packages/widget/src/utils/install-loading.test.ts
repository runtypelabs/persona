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
