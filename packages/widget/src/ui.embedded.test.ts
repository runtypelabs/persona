// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createAgentExperience } from "./ui";
import { initAgentWidget } from "./runtime/init";
import type { AgentWidgetConfig } from "./types";
import { getActiveTheme, getCssVariables } from "./utils/theme";
import { isEmbeddedLayout } from "./utils/panel-config";

const mounted: { destroy(): void }[] = [];
afterEach(() => { mounted.splice(0).forEach(c => c.destroy()); document.body.replaceChildren(); });
const config = (v5Defaults = false, colorScheme: "light" | "dark" = "light"): AgentWidgetConfig => ({
  apiUrl: "/test", persistState: false, future: { v5Defaults }, colorScheme,
  launcher: { enabled: false }, layout: { embedded: true }, welcome: { variant: "none" },
});
const mount = () => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};

describe.each([false, true])("embedded presentation (v5=%s)", v5 => {
  it.each(["light", "dark"] as const)("fills the flex chain and keeps shell surfaces transparent (%s)", scheme => {
    const root = mount();
    mounted.push(createAgentExperience(root, config(v5, scheme)));
    const container = root.querySelector<HTMLElement>(".persona-widget-container")!;
    for (const node of [root, root.firstElementChild, container.parentElement, container] as HTMLElement[]) {
      expect(node.style.display).toBe("flex");
      expect(node.style.minHeight).toBe("0px");
    }
    expect(root.querySelector<HTMLElement>(".persona-widget-body")!.style.overflowY).toBe("auto");
    expect(root.querySelector<HTMLElement>(".persona-widget-footer")!.style.flexShrink).toBe("0");
    expect(root.querySelector<HTMLElement>(".persona-widget-header")!.style.display).toBe("none");
    for (const variable of ["--persona-panel-background", "--persona-transcript-background", "--persona-transcript-top-fade-background", "--persona-composer-footer-background", "--persona-composer-overlay-band"]) {
      expect(root.style.getPropertyValue(variable)).toBe("transparent");
    }
    expect(root.style.getPropertyValue("--persona-components-panel-modes-inline-border")).toBe("none");
    expect(root.style.getPropertyValue("--persona-components-panel-modes-inline-borderRadius")).toBe("0");
  });

  it("restores ordinary inline defaults after a live embedded toggle", () => {
    const root = mount();
    const controller = createAgentExperience(root, config(v5));
    mounted.push(controller);
    expect(root.style.flex).toBe("1 1 0%");
    controller.update({ layout: { embedded: false } });
    expect(root.style.flex).toBe("");
    expect(root.style.getPropertyValue("--persona-panel-background")).not.toBe("transparent");
    expect(root.querySelector<HTMLElement>(".persona-widget-header")!.style.display).not.toBe("none");
    controller.update({ layout: { embedded: true } });
    expect(root.style.flex).toBe("1 1 0%");
    expect(root.style.getPropertyValue("--persona-panel-background")).toBe("transparent");
  });

  it("honors explicit surfaces, header visibility, and dark overrides", () => {
    const root = mount();
    const custom: AgentWidgetConfig = { ...config(v5, "dark"), layout: { embedded: true, showHeader: true },
      theme: { components: { panel: { background: "var(--app-shell)" }, message: { background: "var(--app-transcript)" }, composer: { footerPadding: "8px", footerBackground: "pink" } } },
      darkTheme: { components: { composer: { footerBackground: "#123456" }, message: { topFadeBackground: "var(--app-fade)" } } },
    };
    mounted.push(createAgentExperience(root, custom));
    expect(root.querySelector<HTMLElement>(".persona-widget-header")!.style.display).not.toBe("none");
    expect(root.style.getPropertyValue("--persona-panel-background")).toBe("var(--app-shell)");
    expect(root.style.getPropertyValue("--persona-transcript-top-fade-background")).toBe("var(--app-fade)");
    expect(root.style.getPropertyValue("--persona-composer-footer-background")).toBe("#123456");
    expect(root.style.getPropertyValue("--persona-composer-footer-padding")).toBe("8px");
  });

  it.each([false, true])("isolates nested instances and Shadow DOM (shadow=%s)", useShadowDom => {
    const target = mount();
    const outer = initAgentWidget({ target, useShadowDom, config: config(v5, "dark") });
    mounted.push(outer);
    const outerRoot = (useShadowDom ? outer.host.shadowRoot! : outer.host).querySelector<HTMLElement>("[data-persona-root]")!;
    const innerTarget = document.createElement("div");
    outerRoot.querySelector(".persona-widget-body")!.append(innerTarget);
    const inner = initAgentWidget({ target: innerTarget, useShadowDom, config: { ...config(v5), layout: {}, launcher: { enabled: false, fullHeight: true } } });
    mounted.unshift(inner);
    const innerRoot = (useShadowDom ? inner.host.shadowRoot! : inner.host).querySelector<HTMLElement>("[data-persona-root]")!;
    expect(outerRoot.style.getPropertyValue("--persona-panel-background")).toBe("transparent");
    expect(innerRoot.style.getPropertyValue("--persona-panel-background")).not.toBe("transparent");
    expect(innerRoot.dataset.personaColorScheme).toBe("light");
    expect(outerRoot.dataset.personaColorScheme).toBe("dark");
  });
});

it.each([
  { enabled: true }, { enabled: false, mountMode: "docked" as const },
  { enabled: false, mountMode: "composer-bar" as const }, { enabled: false, sidebarMode: true },
])("ignores embedded in other host modes: %j", launcher => {
  const base = { ...config(), launcher };
  expect(isEmbeddedLayout(base)).toBe(false);
  expect(getCssVariables(getActiveTheme(base))).toEqual(getCssVariables(getActiveTheme({ ...base, layout: {} })));
});

it.each([false, true])("separates activity and code surfaces with V4 fallback compatibility (v5=%s)", v5Defaults => {
  const theme: AgentWidgetConfig["theme"] = { components: {
    collapsibleWidget: { surface: "#aabbcc" }, markdown: { codeBlock: { background: "#112233" } },
  } };
  const get = (override = theme) => getCssVariables(getActiveTheme({ future: { v5Defaults }, theme: override }));
  expect(get()["--persona-components-activity-bodySurface"]).toBe(v5Defaults ? "transparent" : "#aabbcc");
  expect(get()["--persona-md-code-block-bg"]).toBe("#112233");
  const explicit = get({ components: { ...theme.components, activity: { bodySurface: "#223344" }, toolBubble: { bodySurface: "#334455" } } });
  expect(explicit["--persona-components-activity-bodySurface"]).toBe("#223344");
  expect(explicit["--persona-components-toolBubble-bodySurface"]).toBe("#334455");
  expect(explicit["--persona-components-reasoningBubble-bodySurface"]).toBe("#223344");
});
