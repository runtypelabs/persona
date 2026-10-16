// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAgentWidget, type AgentWidgetInitHandle } from "./runtime/init";
import { mount as mountLauncher, type AgentWidgetLauncherHandle } from "./launcher-global";
import type { AgentWidgetConfig } from "./types";

const handles: Array<AgentWidgetInitHandle | AgentWidgetLauncherHandle> = [];
const target = () => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};
const config = (extra: Partial<AgentWidgetConfig> = {}): AgentWidgetConfig => ({
  apiUrl: "/dispatch", persistState: false, ...extra,
});
const widget = (value: AgentWidgetConfig, shadow = false) => {
  const handle = initAgentWidget({ target: target(), config: value, useShadowDom: shadow });
  handles.push(handle);
  const root = (handle.host.shadowRoot ?? handle.host).querySelector<HTMLElement>("[data-persona-root]")!;
  return { handle, root };
};
const launcher = (value: AgentWidgetConfig) => {
  const handle = mountLauncher({ target: target(), config: value, onOpen: vi.fn() });
  handles.push(handle);
  return handle;
};
// Full UI geometry adds these independently of theme application.
const geometryVariables = new Set([
  "--persona-composer-anchor-gap", "--persona-composer-lift",
  "--persona-composer-overlay-height", "--persona-content-max-width",
  "--persona-artifact-pane-max-width", "--persona-artifact-pane-width", "--persona-artifact-split-gap",
]);
const variables = (root: HTMLElement) => Object.fromEntries(
  Array.from(root.style).filter((key) => key.startsWith("--persona-") && !geometryVariables.has(key)).map((key) => [key, root.style.getPropertyValue(key)])
);

// The critical launcher intentionally excludes panel-only aliases. Every value
// it does emit must match the full widget, including all canonical host tokens.
const expectLauncherParity = (critical: HTMLElement, full: HTMLElement) => {
  const actual = variables(critical);
  expect(Object.keys(actual).length).toBeGreaterThan(100);
  expect(variables(full)).toMatchObject(actual);
  for (const key of ["--persona-launcher-bg", "--persona-launcher-fg", "--persona-launcher-border", "--persona-launcher-shadow"]) {
    expect(actual[key], key).toBeTruthy();
  }
};

beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(() => {
  handles.splice(0).forEach((handle) => handle.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe.each([false, true])("brand public lifecycle (v5=%s)", (v5Defaults) => {
  it.each(["light", "dark"] as const)("keeps deferred and full launcher theme variables identical in %s", (colorScheme) => {
    const value = config({ future: { v5Defaults }, colorScheme, brand: {
      accent: "#b62052", neutral: "#23272e", font: "Georgia, serif",
      radius: "lg", density: "compact", elevation: "raised",
    } });
    const full = widget(value);
    const critical = launcher(value);
    expectLauncherParity(critical.root, full.root);
    expect(full.root.dataset.personaColorScheme).toBe(critical.root.dataset.personaColorScheme);
    expect(full.root.style.cssText).toContain("Georgia");
    const next = { ...value, brand: { ...value.brand, accent: "#0b785a", font: "Arial, sans-serif" } };
    full.handle.update({ brand: next.brand });
    critical.update(next);
    expectLauncherParity(critical.root, full.root);
    full.handle.update({ brand: undefined });
    critical.update({ ...value, brand: undefined });
    expectLauncherParity(critical.root, full.root);
  });

  it("restores the absent-brand theme after removal and preserves sibling fields during patches", () => {
    const value = config({ future: { v5Defaults }, colorScheme: "light" });
    const baseline = widget(value);
    const live = widget(value);
    const before = variables(baseline.root);
    live.handle.update({ brand: { accent: "#ad174c", font: "Georgia, serif", radius: "lg" } });
    expect(variables(live.root)).not.toEqual(before);
    live.handle.update({ brand: { accent: "#0b785a" } });
    expect(live.root.style.cssText).toContain("Georgia");
    live.handle.update({ brand: undefined });
    expect(variables(live.root)).toEqual(before);
    expect(variables(baseline.root)).toEqual(before);
    const critical = launcher(value);
    expectLauncherParity(critical.root, baseline.root);
  });

  it("keeps explicit light and dark component overrides above brand derivation across updates", () => {
    const live = widget(config({ future: { v5Defaults }, colorScheme: "light",
      brand: { accent: "#ad174c", radius: "lg" },
      theme: { components: { launcher: { background: "#123456" } } },
      darkTheme: { components: { launcher: { background: "#654321" } } },
    }));
    const background = () => live.root.style.getPropertyValue("--persona-components-launcher-background");
    expect(background()).toBe("#123456");
    live.handle.update({ brand: { accent: "#0b785a" }, colorScheme: "dark" });
    expect(background()).toBe("#654321");
    live.handle.update({ brand: undefined });
    expect(background()).toBe("#654321");
  });

  it("isolates brand variables between shadow and ordinary instances", () => {
    const ordinary = widget(config({ future: { v5Defaults }, brand: { font: "Georgia, serif" } }));
    const shadow = widget(config({ future: { v5Defaults }, brand: { font: "Courier New, monospace" } }), true);
    const ordinaryBefore = variables(ordinary.root);
    expect(shadow.root.getRootNode()).toBeInstanceOf(ShadowRoot);
    expect(shadow.root.style.cssText).toContain("Courier New");
    shadow.handle.update({ brand: { font: "Arial, sans-serif" } });
    expect(shadow.root.style.cssText).toContain("Arial");
    expect(variables(ordinary.root)).toEqual(ordinaryBefore);
    expect(document.documentElement.style.cssText).toBe("");
  });
});

it("keeps explicit auto responsive to OS changes with a dark brand neutral", () => {
  let dark = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return dark; },
    addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback),
  })));
  try {
    const value = config({ colorScheme: "auto", brand: { neutral: "#151515", accent: "#ad174c" } });
    const live = widget(value);
    expect(live.root.dataset.personaColorScheme).toBe("light");
    const light = variables(live.root);
    dark = true;
    listeners.forEach((listener) => listener());
    expect(live.root.dataset.personaColorScheme).toBe("dark");
    expect(variables(live.root)).not.toEqual(light);
    const critical = launcher(value);
    expectLauncherParity(critical.root, live.root);
    dark = false;
    listeners.forEach((listener) => listener());
    expect(live.root.dataset.personaColorScheme).toBe("light");
    expect(variables(live.root)).toMatchObject(light);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("infers a dark brand scheme consistently for deferred and initialized widgets", () => {
  const value = config({ brand: { neutral: "#151515" } });
  const full = widget(value);
  const critical = launcher(value);
  expect(full.root.dataset.personaColorScheme).toBe("dark");
  expect(critical.root.dataset.personaColorScheme).toBe("dark");
  expectLauncherParity(critical.root, full.root);
  full.handle.update({ brand: { neutral: "#ffffff" } });
  expect(full.root.dataset.personaColorScheme).toBe("light");
  full.handle.update({ brand: { neutral: "#151515" } });
  expect(full.root.dataset.personaColorScheme).toBe("dark");
  full.handle.update({ colorScheme: "light" });
  expect(full.root.dataset.personaColorScheme).toBe("light");
  full.handle.update({ colorScheme: undefined });
  expect(full.root.dataset.personaColorScheme).toBe("dark");
  full.handle.update({ brand: undefined });
  expect(full.root.dataset.personaColorScheme).toBe("light");
});
