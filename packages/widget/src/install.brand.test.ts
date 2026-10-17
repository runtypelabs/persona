// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentWidgetLauncherMountOptions } from "./launcher-global";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  document.head.replaceChildren();
  document.body.replaceChildren();
  window.sessionStorage.clear();
  window.localStorage.clear();
  Reflect.deleteProperty(window, "__siteAgentInstallerLoaded");
});
afterEach(() => {
  for (const key of ["__siteAgentInstallerLoaded", "siteAgentConfig", "AgentWidget", "AgentWidgetLauncher"]) {
    Reflect.deleteProperty(window, key);
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(["nested", "top-level"])("preserves %s brand through the deferred installer handoff", async (placement) => {
  const brand = { accent: "#ad174c", neutral: "#202020", font: "Georgia, serif", radius: "lg", density: "compact", elevation: "raised" };
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.setAttribute("data-persona", "true");
  document.head.append(link);
  let onOpen: (() => void) | undefined;
  const launcherMount = vi.fn((options: AgentWidgetLauncherMountOptions) => {
    onOpen = options.onOpen;
    return { root: document.createElement("div"), element: document.createElement("button"), update: vi.fn(), destroy: vi.fn() };
  });
  const initAgentWidget = vi.fn(() => ({ open: vi.fn(), close: vi.fn(), on: vi.fn() }));
  Object.assign(window, {
    AgentWidget: { initAgentWidget },
    AgentWidgetLauncher: { mount: launcherMount },
    siteAgentConfig: placement === "nested"
      ? { config: { apiUrl: "/dispatch", brand } }
      : { apiUrl: "/dispatch", brand },
  });
  await import("./install");
  await vi.runAllTimersAsync();
  expect(launcherMount).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ brand }) }));
  expect(onOpen).toBeTypeOf("function");
  onOpen!();
  await vi.runAllTimersAsync();
  expect(initAgentWidget).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ brand }) }));
});
