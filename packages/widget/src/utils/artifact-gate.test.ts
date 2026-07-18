import { describe, expect, it, vi } from "vitest";
import {
  applyArtifactLayoutCssVars,
  applyArtifactPaneAppearance,
  applyArtifactPaneBorderTheme,
  artifactsSidebarEnabled,
} from "./artifact-gate";
import type { AgentWidgetConfig } from "../types";

function baseConfig(overrides: Partial<AgentWidgetConfig> = {}): AgentWidgetConfig {
  return {
    apiUrl: "/api",
    ...overrides,
  } as AgentWidgetConfig;
}

/** Minimal DOM shim (widget vitest uses `environment: 'node'`). */
function createFakeMount(): HTMLElement {
  const classes = new Set<string>();
  const cssProps: Record<string, string> = {};
  return {
    classList: {
      remove(...names: string[]) {
        for (const n of names) {
          for (const part of n.split(/\s+/).filter(Boolean)) {
            classes.delete(part);
          }
        }
      },
      add(name: string) {
        classes.add(name);
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
    style: {
      setProperty(name: string, value: string) {
        cssProps[name] = value;
      },
      removeProperty(name: string) {
        delete cssProps[name];
      },
      getPropertyValue(name: string) {
        return cssProps[name] ?? "";
      },
    },
  } as unknown as HTMLElement;
}

describe("applyArtifactPaneAppearance", () => {
  it("clears classes and radius when artifacts disabled", () => {
    const mount = createFakeMount();
    mount.classList.add("persona-artifact-appearance-panel");
    mount.style.setProperty("--persona-artifact-pane-radius", "99px");
    applyArtifactPaneAppearance(
      mount,
      baseConfig({ features: { artifacts: { enabled: false } } })
    );
    expect(mount.classList.contains("persona-artifact-appearance-panel")).toBe(false);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-radius")).toBe("");
  });

  it("adds panel class by default when artifacts enabled", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({ features: { artifacts: { enabled: true } } })
    );
    expect(mount.classList.contains("persona-artifact-appearance-panel")).toBe(true);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-radius")).toBe("");
  });

  it("treats unifiedSplitChrome as a no-op and no longer owns the welded outer radius", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        features: {
          artifacts: { enabled: true, layout: { unifiedSplitChrome: true, unifiedSplitOuterRadius: "12px" } },
        },
      })
    );
    // Welding is now the default (JS-toggled at runtime), so the deprecated
    // option adds no class here. The welded outer radius is owned by ui.ts
    // syncPanelChrome (derived from the resolved panel radius), not this function.
    expect(mount.classList.contains("persona-artifact-unified-split")).toBe(false);
    expect(mount.style.getPropertyValue("--persona-artifact-welded-outer-radius").trim()).toBe("");
  });

  it("adds seamless class and border radius on any mode", () => {
    const ext = createFakeMount();
    applyArtifactPaneAppearance(
      ext,
      baseConfig({
        features: { artifacts: { enabled: true, layout: { paneAppearance: "seamless" } } },
      })
    );
    expect(ext.classList.contains("persona-artifact-appearance-seamless")).toBe(true);

    const rounded = createFakeMount();
    applyArtifactPaneAppearance(
      rounded,
      baseConfig({
        features: {
          artifacts: { enabled: true, layout: { paneAppearance: "panel", paneBorderRadius: "1rem" } },
        },
      })
    );
    expect(rounded.classList.contains("persona-artifact-appearance-panel")).toBe(true);
    expect(rounded.style.getPropertyValue("--persona-artifact-pane-radius").trim()).toBe("1rem");
  });

  it("sets paneShadow CSS var when provided", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        features: {
          artifacts: { enabled: true, layout: { paneShadow: "none" } },
        },
      })
    );
    expect(mount.style.getPropertyValue("--persona-artifact-pane-shadow").trim()).toBe("none");
  });

  it("falls back to panel for invalid paneAppearance", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        features: {
          artifacts: { enabled: true, layout: { paneAppearance: "nope" as never } },
        },
      })
    );
    expect(mount.classList.contains("persona-artifact-appearance-panel")).toBe(true);
  });

  it("resolves detached when detachedPanel true and paneAppearance unset", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        launcher: { detachedPanel: true },
        features: { artifacts: { enabled: true } },
      })
    );
    expect(mount.classList.contains("persona-artifact-appearance-detached")).toBe(true);
    expect(mount.classList.contains("persona-artifact-appearance-panel")).toBe(false);
  });

  it("explicit panel beats detachedPanel true", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        launcher: { detachedPanel: true },
        features: { artifacts: { enabled: true, layout: { paneAppearance: "panel" } } },
      })
    );
    expect(mount.classList.contains("persona-artifact-appearance-panel")).toBe(true);
    expect(mount.classList.contains("persona-artifact-appearance-detached")).toBe(false);
  });

  it("explicit detached works without detachedPanel", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        features: { artifacts: { enabled: true, layout: { paneAppearance: "detached" } } },
      })
    );
    expect(mount.classList.contains("persona-artifact-appearance-detached")).toBe(true);
  });

  it("treats unifiedSplitChrome as a silent no-op when detached", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        features: {
          artifacts: {
            enabled: true,
            layout: { paneAppearance: "detached", unifiedSplitChrome: true },
          },
        },
      })
    );
    expect(mount.classList.contains("persona-artifact-appearance-detached")).toBe(true);
    expect(mount.classList.contains("persona-artifact-unified-split")).toBe(false);
    // Deprecated no-op: no warning now that welding is the panel/seamless default.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps explicit paneShadow over detached defaults", () => {
    const mount = createFakeMount();
    applyArtifactPaneAppearance(
      mount,
      baseConfig({
        launcher: { detachedPanel: true },
        features: { artifacts: { enabled: true, layout: { paneShadow: "0 0 0 red" } } },
      })
    );
    expect(mount.classList.contains("persona-artifact-appearance-detached")).toBe(true);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-shadow").trim()).toBe(
      "0 0 0 red"
    );
  });
});

describe("applyArtifactPaneBorderTheme", () => {
  it("clears when artifacts disabled", () => {
    const mount = createFakeMount();
    mount.classList.add("persona-artifact-border-full");
    mount.style.setProperty("--persona-artifact-pane-border", "2px solid red");
    applyArtifactPaneBorderTheme(
      mount,
      baseConfig({ features: { artifacts: { enabled: false } } })
    );
    expect(mount.classList.contains("persona-artifact-border-full")).toBe(false);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-border")).toBe("");
  });

  it("prefers paneBorder over paneBorderLeft", () => {
    const mount = createFakeMount();
    applyArtifactPaneBorderTheme(
      mount,
      baseConfig({
        features: {
          artifacts: {
            enabled: true,
            layout: { paneBorder: "1px solid #ccc", paneBorderLeft: "4px solid blue" },
          },
        },
      })
    );
    expect(mount.classList.contains("persona-artifact-border-full")).toBe(true);
    expect(mount.classList.contains("persona-artifact-border-left")).toBe(false);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-border").trim()).toBe("1px solid #ccc");
  });

  it("sets border-left only when paneBorderLeft alone", () => {
    const mount = createFakeMount();
    applyArtifactPaneBorderTheme(
      mount,
      baseConfig({
        features: { artifacts: { enabled: true, layout: { paneBorderLeft: "1px solid #cccccc" } } },
      })
    );
    expect(mount.classList.contains("persona-artifact-border-left")).toBe(true);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-border-left").trim()).toBe(
      "1px solid #cccccc"
    );
  });
});

describe("artifactsSidebarEnabled", () => {
  it("is true only when enabled flag is true", () => {
    expect(artifactsSidebarEnabled(undefined)).toBe(false);
    expect(artifactsSidebarEnabled(baseConfig())).toBe(false);
    expect(
      artifactsSidebarEnabled(baseConfig({ features: { artifacts: { enabled: true } } }))
    ).toBe(true);
  });
});

describe("applyArtifactLayoutCssVars", () => {
  it("sets pane background and padding CSS vars when provided", () => {
    const mount = createFakeMount();
    applyArtifactLayoutCssVars(
      mount,
      baseConfig({
        features: {
          artifacts: {
            enabled: true,
            layout: {
              paneBackground: "#212121",
              panePadding: "24px",
            },
          },
        },
      })
    );
    expect(mount.style.getPropertyValue("--persona-artifact-pane-bg").trim()).toBe("#212121");
    expect(mount.style.getPropertyValue("--persona-artifact-pane-padding").trim()).toBe("24px");
  });

  it("defaults split gap to panel inset when detached, explicit splitGap wins", () => {
    const detached = createFakeMount();
    applyArtifactLayoutCssVars(
      detached,
      baseConfig({
        launcher: { detachedPanel: true },
        features: { artifacts: { enabled: true } },
      })
    );
    expect(detached.style.getPropertyValue("--persona-artifact-split-gap").trim()).toBe(
      "var(--persona-panel-inset)"
    );

    const explicit = createFakeMount();
    applyArtifactLayoutCssVars(
      explicit,
      baseConfig({
        launcher: { detachedPanel: true },
        features: { artifacts: { enabled: true, layout: { splitGap: "2rem" } } },
      })
    );
    expect(explicit.style.getPropertyValue("--persona-artifact-split-gap").trim()).toBe("2rem");

    // Panel/seamless weld at gap 0 by default.
    const welded = createFakeMount();
    applyArtifactLayoutCssVars(
      welded,
      baseConfig({ features: { artifacts: { enabled: true } } })
    );
    expect(welded.style.getPropertyValue("--persona-artifact-split-gap").trim()).toBe("0");
  });

  it("clears pane bg and padding when artifacts disabled", () => {
    const mount = createFakeMount();
    mount.style.setProperty("--persona-artifact-pane-bg", "#000");
    mount.style.setProperty("--persona-artifact-pane-padding", "8px");
    applyArtifactLayoutCssVars(
      mount,
      baseConfig({ features: { artifacts: { enabled: false } } })
    );
    expect(mount.style.getPropertyValue("--persona-artifact-pane-bg")).toBe("");
    expect(mount.style.getPropertyValue("--persona-artifact-pane-padding")).toBe("");
  });

  it("sets document toolbar layout CSS vars when provided", () => {
    const mount = createFakeMount();
    applyArtifactLayoutCssVars(
      mount,
      baseConfig({
        features: {
          artifacts: {
            enabled: true,
            layout: {
              documentToolbarIconColor: "#60a5fa",
              documentToolbarToggleActiveBackground: "#262626",
              documentToolbarToggleActiveBorderColor: "#444444",
            },
          },
        },
      })
    );
    expect(mount.style.getPropertyValue("--persona-artifact-doc-toolbar-icon-color").trim()).toBe(
      "#60a5fa"
    );
    expect(mount.style.getPropertyValue("--persona-artifact-doc-toggle-active-bg").trim()).toBe(
      "#262626"
    );
    expect(mount.style.getPropertyValue("--persona-artifact-doc-toggle-active-border").trim()).toBe(
      "#444444"
    );
  });
});
