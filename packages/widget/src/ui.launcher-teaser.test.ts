// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { mount as mountCriticalLauncher } from "./launcher-global";

const TEASER = "[data-persona-launcher-teaser]";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

let keyCounter = 0;
const nextPrefix = () => `ui-teaser-test-${++keyCounter}-`;

describe("launcher teaser", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the same teaser from the full widget and the critical bundle", () => {
    const prefix = nextPrefix();
    const config = {
      apiUrl: "https://api.example.com/chat",
      persistState: { keyPrefix: prefix },
      launcher: { teaser: { text: "Questions about pricing?" } },
    };

    const host = createMount();
    const controller = createAgentExperience(host, config);
    const eager = host.querySelector<HTMLElement>(TEASER);

    const criticalTarget = createMount();
    const critical = mountCriticalLauncher({
      target: criticalTarget,
      config,
      onOpen: () => {},
    });
    const deferred = criticalTarget.querySelector<HTMLElement>(TEASER);

    expect(eager).not.toBeNull();
    expect(deferred).not.toBeNull();
    expect(deferred!.outerHTML).toBe(eager!.outerHTML);
    expect(deferred!.parentElement!.getAttribute("data-teaser")).toBe(
      eager!.parentElement!.getAttribute("data-teaser")
    );

    critical.destroy();
    controller.destroy();
  });

  it("live-updates the teaser through controller.update()", () => {
    const prefix = nextPrefix();
    const host = createMount();
    const controller = createAgentExperience(host, {
      apiUrl: "https://api.example.com/chat",
      persistState: { keyPrefix: prefix },
    });

    expect(host.querySelector(TEASER)).toBeNull();

    controller.update({ launcher: { teaser: { text: "Need a hand?" } } });
    const teaser = host.querySelector<HTMLElement>(TEASER);
    expect(teaser).not.toBeNull();
    expect(teaser!.querySelector("button")!.textContent).toBe("Need a hand?");

    controller.update({ launcher: { teaser: { text: "Still here to help" } } });
    expect(host.querySelector<HTMLElement>(TEASER)!.querySelector("button")!.textContent).toBe(
      "Still here to help"
    );

    controller.update({ launcher: { teaser: undefined } });
    expect(host.querySelector(TEASER)).toBeNull();

    controller.destroy();
  });

  it("suppresses the teaser when the panel starts open", () => {
    vi.useFakeTimers();
    const prefix = nextPrefix();
    const host = createMount();
    const controller = createAgentExperience(host, {
      apiUrl: "https://api.example.com/chat",
      persistState: { keyPrefix: prefix },
      launcher: { autoExpand: true, teaser: { text: "Need a hand?" } },
    });

    vi.advanceTimersByTime(1000);
    expect(host.querySelector<HTMLElement>(TEASER)!.hidden).toBe(true);

    controller.destroy();
  });

  it("suppresses the teaser when restored open state opens the panel", () => {
    vi.useFakeTimers();
    const prefix = nextPrefix();
    window.sessionStorage.setItem(`${prefix}widget-open`, "true");
    const host = createMount();
    const controller = createAgentExperience(host, {
      apiUrl: "https://api.example.com/chat",
      persistState: { keyPrefix: prefix, persist: { openState: true } },
      launcher: { teaser: { text: "Need a hand?" } },
    });

    vi.advanceTimersByTime(1000);

    expect(host.querySelector<HTMLElement>(TEASER)!.hidden).toBe(true);
    expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBeNull();

    controller.destroy();
  });

  it("suppresses the teaser when onStateLoaded requests an open", () => {
    vi.useFakeTimers();
    const prefix = nextPrefix();
    const host = createMount();
    const controller = createAgentExperience(host, {
      apiUrl: "https://api.example.com/chat",
      persistState: { keyPrefix: prefix },
      launcher: { teaser: { text: "Need a hand?" } },
      onStateLoaded: (state) => ({ state, open: true }),
    });

    vi.advanceTimersByTime(1000);

    expect(host.querySelector<HTMLElement>(TEASER)!.hidden).toBe(true);
    expect(window.localStorage.getItem(`${prefix}teaser-dismissed`)).toBeNull();

    controller.destroy();
  });

  it("clears the pending teaser timer when the widget is destroyed", () => {
    vi.useFakeTimers();
    const prefix = nextPrefix();
    const host = createMount();
    const controller = createAgentExperience(host, {
      apiUrl: "https://api.example.com/chat",
      persistState: { keyPrefix: prefix },
      launcher: { teaser: { text: "Need a hand?", delayMs: 5000 } },
    });

    const teaser = host.querySelector<HTMLElement>(TEASER);
    expect(teaser!.hidden).toBe(true);

    controller.destroy();
    vi.advanceTimersByTime(10000);

    expect(teaser!.hidden).toBe(true);
    expect(host.querySelector(TEASER)).toBeNull();
  });
});
