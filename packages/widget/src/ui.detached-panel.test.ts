// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig } from "./types";

const originalInnerWidth = window.innerWidth;

beforeAll(() => {
  // jsdom does not implement matchMedia; the artifact pane's layout code touches
  // it. Evaluate min-width/max-width px queries against the live innerWidth so
  // the shim exercises the real drawer-vs-split gating instead of always false.
  window.matchMedia = ((query: string) => {
    const evaluate = () => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      if (max) return window.innerWidth <= Number(max[1]);
      const min = /min-width:\s*(\d+)px/.exec(query);
      if (min) return window.innerWidth >= Number(min[1]);
      return false;
    };
    return {
      get matches() {
        return evaluate();
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
});

const setInnerWidth = (value: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value,
  });
};

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const queryPanel = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-panel");

// Launcher-off (inline/docked) modes render wrapper > panel > container without
// the .persona-widget-panel class, so reach the panel via the container's parent.
const queryEmbedRefs = (mount: HTMLElement) => {
  const container = mount.querySelector<HTMLElement>(".persona-widget-container");
  return {
    wrapper: mount.firstElementChild as HTMLElement | null,
    panel: (container?.parentElement ?? null) as HTMLElement | null,
    container,
  };
};

describe("createAgentExperience detached panel", () => {
  beforeEach(() => {
    // Desktop viewport so mobile fullscreen does not override sidebar chrome.
    setInnerWidth(1024);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setInnerWidth(originalInnerWidth);
  });

  it("keeps flush sidebar chrome when detachedPanel is unset", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        sidebarMode: true,
        position: "bottom-right",
      },
    });

    const wrapper = mount.firstElementChild as HTMLElement;
    const panel = queryPanel(mount);

    expect(mount.hasAttribute("data-persona-panel-detached")).toBe(false);
    expect(wrapper.style.top).toBe("0px");
    expect(wrapper.style.bottom).toBe("0px");
    expect(wrapper.style.right).toBe("0px");
    expect(wrapper.style.height).toBe("100vh");
    expect(panel?.style.borderRadius).toBe("0px");

    controller.destroy();
  });

  it("insets the sidebar card and stamps the detached attribute when detached", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        sidebarMode: true,
        position: "bottom-right",
        detachedPanel: true,
      },
    });

    const wrapper = mount.firstElementChild as HTMLElement;
    const panel = queryPanel(mount);

    expect(mount.getAttribute("data-persona-panel-detached")).toBe("true");
    expect(wrapper.style.top).toBe("var(--persona-panel-inset)");
    expect(wrapper.style.bottom).toBe("var(--persona-panel-inset)");
    expect(wrapper.style.right).toBe("var(--persona-panel-inset)");
    expect(wrapper.style.left).toBe("auto");
    expect(wrapper.style.height).toContain("var(--persona-panel-inset)");
    expect(wrapper.style.height).toContain("calc");
    // Card chrome restored: radius is no longer the flush 0.
    expect(panel?.style.borderRadius).not.toBe("0");
    expect(panel?.style.borderRadius).not.toBe("");

    controller.destroy();
  });

  it("anchors the inset to the left for a left-positioned detached sidebar", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        sidebarMode: true,
        position: "bottom-left",
        detachedPanel: true,
      },
    });

    const wrapper = mount.firstElementChild as HTMLElement;

    expect(wrapper.style.left).toBe("var(--persona-panel-inset)");
    expect(wrapper.style.right).toBe("auto");

    controller.destroy();
  });

  it("does not pad the wrapper for docked + launcher off + detached (host-layout owns the inset)", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "docked",
        enabled: false,
        detachedPanel: true,
      },
    });

    const { wrapper } = queryEmbedRefs(mount);

    // Detached card still stamped, but the inset comes from host-layout, not here.
    expect(mount.getAttribute("data-persona-panel-detached")).toBe("true");
    expect(wrapper?.style.padding).toBe("");

    controller.destroy();
  });

  it("drops card chrome for docked + launcher off + detached on a mobile viewport", () => {
    setInnerWidth(480);
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "docked",
        enabled: false,
        detachedPanel: true,
      },
    });

    const { wrapper, panel } = queryEmbedRefs(mount);

    // Host-layout goes flush fullscreen: no detached attribute, no card shadow or inset.
    expect(mount.hasAttribute("data-persona-panel-detached")).toBe(false);
    expect(panel?.style.boxShadow).toBe("none");
    expect(wrapper?.style.padding).toBe("");

    controller.destroy();
  });

  it("does not clip the card shadow with overflow:hidden for an inline detached embed", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        enabled: false,
        detachedPanel: true,
      },
    });

    const { wrapper } = queryEmbedRefs(mount);

    expect(mount.getAttribute("data-persona-panel-detached")).toBe("true");
    // Canvas padding applied, but no overflow:hidden so the xl shadow can escape.
    expect(wrapper?.style.padding).toBe("var(--persona-panel-inset)");
    expect(wrapper?.style.overflow).not.toBe("hidden");

    controller.destroy();
  });

  it("renders a flush inline embed with no shadow; detached opts elevation back in", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    const { panel } = queryEmbedRefs(mount);
    expect(panel?.style.boxShadow).toBe("none");
    controller.destroy();

    const detachedMount = createMount();
    const detachedController = createAgentExperience(detachedMount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, detachedPanel: true },
    });

    const detachedPanel = queryEmbedRefs(detachedMount).panel;
    expect(detachedPanel?.style.boxShadow).toContain("--persona-panel-shadow");
    detachedController.destroy();
  });
});

describe("createAgentExperience detached artifact split chrome", () => {
  beforeEach(() => {
    // Desktop viewport so the split renders side-by-side (not the narrow drawer).
    setInnerWidth(1024);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setInnerWidth(originalInnerWidth);
  });

  const artifactConfig = (
    launcher: AgentWidgetConfig["launcher"]
  ): AgentWidgetConfig => ({
    apiUrl: "https://api.example.com/chat",
    launcher,
    features: {
      artifacts: { enabled: true, allowedTypes: ["markdown"] },
    },
  });

  // Artifacts nest the container in a split root, so the panel is the split
  // root's parent (container.parentElement would be the chat column).
  const splitRefs = (mount: HTMLElement) => {
    const container = mount.querySelector<HTMLElement>(".persona-widget-container");
    const split = mount.querySelector<HTMLElement>(".persona-artifact-split-root");
    return {
      panel: (split?.parentElement ?? container?.parentElement ?? null) as HTMLElement | null,
      container,
    };
  };

  const openArtifact = (controller: ReturnType<typeof createAgentExperience>) => {
    controller.upsertArtifact({
      id: "split-test",
      title: "Split test",
      artifactType: "markdown",
      content: "# Hello",
    });
  };

  it("suppresses the outer panel shadow and cards the chat column when a detached split is active", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      artifactConfig({ enabled: false, detachedPanel: true })
    );
    const { panel, container } = splitRefs(mount);

    // No pane open yet: panel is the single card and keeps its shadow.
    expect(panel?.style.boxShadow).toContain("--persona-panel-shadow");

    openArtifact(controller);

    // Detached split active: outer union shadow gone, chat column is its own card.
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    expect(panel?.style.boxShadow).toBe("none");
    expect(container?.style.boxShadow).toContain("--persona-artifact-pane-shadow");
    expect(container?.style.border).toContain("--persona-panel-border");

    controller.destroy();
  });

  it("restores the panel card shadow when the pane closes", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      artifactConfig({ enabled: false, detachedPanel: true })
    );
    const { panel, container } = splitRefs(mount);

    openArtifact(controller);
    expect(panel?.style.boxShadow).toBe("none");

    controller.hideArtifacts();

    // Pane closed: the panel is the single visible card again and re-elevates.
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(panel?.style.boxShadow).toContain("--persona-panel-shadow");
    expect(container?.style.boxShadow).toBe("");

    controller.destroy();
  });

  it("leaves the outer panel shadow intact for the default panel appearance", () => {
    const mount = createMount();
    // Floating launcher (default): the panel is an elevated card, so the panel
    // appearance keeps the outer shadow instead of the flush inline embed's none.
    const controller = createAgentExperience(
      mount,
      artifactConfig({ detachedPanel: false })
    );
    const { panel, container } = splitRefs(mount);

    openArtifact(controller);

    // Panel appearance: one shared card, so the outer shadow survives and the
    // chat column does not get its own elevation.
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(panel?.style.boxShadow).not.toBe("none");
    expect(container?.style.boxShadow).toBe("");

    controller.destroy();
  });

  it("flattens the chat card via layout.chatShadow while the pane stays raised", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, detachedPanel: true },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          layout: { chatShadow: "none" },
        },
      },
    });
    const { container } = splitRefs(mount);

    openArtifact(controller);

    // Chat card resolves through the new front lookup, and the mount pins it to none.
    expect(container?.style.boxShadow).toContain("--persona-artifact-chat-shadow");
    expect(mount.style.getPropertyValue("--persona-artifact-chat-shadow")).toBe("none");

    controller.destroy();
  });

  it("does not set the chat shadow var by default and leaves the pane chain intact", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      artifactConfig({ enabled: false, detachedPanel: true })
    );
    const { container } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.style.getPropertyValue("--persona-artifact-chat-shadow")).toBe("");
    expect(container?.style.boxShadow).toContain("--persona-artifact-pane-shadow");

    controller.destroy();
  });

  it("does not leak chatShadow onto the welded chat column", () => {
    const mount = createMount();
    // Panel appearance welds into one card, so the chat container shadow is blanked
    // regardless of chatShadow; the var must not re-elevate it.
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { detachedPanel: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          layout: { chatShadow: "0 0 0 red" },
        },
      },
    });
    const { container } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(container?.style.boxShadow).toBe("");

    controller.destroy();
  });

  it("uses the hardcoded 640 split boundary, not launcher.mobileBreakpoint", () => {
    // 800px is above the 641 desktop split boundary but below a custom
    // mobileBreakpoint of 900: the split must stay active regardless, because
    // the artifact split CSS is hardcoded at 640/641 and mobileBreakpoint must
    // not move it (otherwise the predicate and the CSS disagree).
    setInnerWidth(800);
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      artifactConfig({ enabled: false, detachedPanel: true, mobileBreakpoint: 900 })
    );
    const { panel } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    expect(panel?.style.boxShadow).toBe("none");

    controller.destroy();
  });

  it("does not clip the fullHeight panel overflow when a detached split is active", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      artifactConfig({ fullHeight: true, detachedPanel: true })
    );
    const { panel, container } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    // Each card carries its own shadow that must escape the panel, so the panel
    // must not set overflow:hidden.
    expect(panel?.style.overflow).not.toBe("hidden");
    // The chat card still clips its own content inside its rounded border.
    expect(container?.style.overflow).toBe("hidden");

    controller.destroy();
  });

  it("does not suppress the panel shadow on a mobile viewport", () => {
    setInnerWidth(480);
    const mount = createMount();
    // Inline embed keeps the launcher off so mobile does not force fullscreen
    // (which zeroes the shadow for its own reasons); the detached card is intact.
    const controller = createAgentExperience(
      mount,
      artifactConfig({ enabled: false, detachedPanel: true })
    );
    const { panel } = splitRefs(mount);

    openArtifact(controller);

    // Below the breakpoint the pane is a drawer overlay, so the panel stays the
    // single detached card and the detached-split suppression must not apply.
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(panel?.style.boxShadow).toContain("--persona-panel-shadow");

    controller.destroy();
  });
});

describe("createAgentExperience detached appearance perimeter inset", () => {
  beforeEach(() => {
    // Desktop viewport so the split renders side-by-side (not the narrow drawer).
    setInnerWidth(1024);
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setInnerWidth(originalInnerWidth);
    localStorage.clear();
  });

  const wrapperOf = (mount: HTMLElement) => mount.firstElementChild as HTMLElement;

  const openArtifact = (controller: ReturnType<typeof createAgentExperience>) => {
    controller.upsertArtifact({
      id: "inset-test",
      title: "Inset test",
      artifactType: "markdown",
      content: "# Hello",
    });
  };

  it("pads the wrapper for an inline detached-appearance split with detachedPanel unset", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          layout: { paneAppearance: "detached" },
        },
      },
    });

    openArtifact(controller);

    const wrapper = wrapperOf(mount);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    expect(wrapper.style.padding).toBe("var(--persona-panel-inset)");
    expect(wrapper.style.background).toContain("--persona-panel-canvas-bg");

    controller.destroy();
  });

  it("does not pad the wrapper for the default (welded) inline embed with a pane open", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    });

    openArtifact(controller);

    const wrapper = wrapperOf(mount);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(wrapper.style.padding).toBe("");

    controller.destroy();
  });

  it("clears the perimeter inset after the detached-appearance pane closes", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          layout: { paneAppearance: "detached" },
        },
      },
    });

    openArtifact(controller);
    expect(wrapperOf(mount).style.padding).toBe("var(--persona-panel-inset)");

    controller.hideArtifacts();

    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(wrapperOf(mount).style.padding).toBe("");

    controller.destroy();
  });

  it("still pads an inline detachedPanel embed (unchanged detached-card path)", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, detachedPanel: true },
      features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    });

    const wrapper = wrapperOf(mount);
    expect(mount.getAttribute("data-persona-panel-detached")).toBe("true");
    expect(wrapper.style.padding).toBe("var(--persona-panel-inset)");

    controller.destroy();
  });
});

describe("createAgentExperience detached split chat surface", () => {
  beforeEach(() => {
    // Desktop viewport so the split renders side-by-side (not the narrow drawer).
    setInnerWidth(1024);
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setInnerWidth(originalInnerWidth);
    localStorage.clear();
  });

  const wrapperOf = (mount: HTMLElement) => mount.firstElementChild as HTMLElement;
  const containerOf = (mount: HTMLElement) =>
    mount.querySelector<HTMLElement>(".persona-widget-container");
  const bodyOf = (mount: HTMLElement) =>
    mount.querySelector<HTMLElement>(".persona-widget-body");
  const footerOf = (mount: HTMLElement) =>
    mount.querySelector<HTMLElement>(".persona-widget-footer");

  const openArtifact = (controller: ReturnType<typeof createAgentExperience>) => {
    controller.upsertArtifact({
      id: "surface-test",
      title: "Surface test",
      artifactType: "markdown",
      content: "# Hello",
    });
  };

  const flushConfig = (
    chatSurface: "card" | "flush"
  ): AgentWidgetConfig => ({
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    features: {
      artifacts: {
        enabled: true,
        allowedTypes: ["markdown"],
        layout: { paneAppearance: "detached", chatSurface },
      },
    },
  });

  it("flushes the chat and insets only the pane when chatSurface is flush", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, flushConfig("flush"));

    openArtifact(controller);

    const container = containerOf(mount);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(true);
    // Chat column chrome dropped: flat flush background beside the floating pane.
    expect(container?.style.borderStyle).toBe("none");
    expect(container?.style.borderRadius).toBe("0px");
    expect(container?.style.boxShadow).toBe("");
    // The chat paints no surface of its own; the wrapper's canvas shows through.
    // Body and footer backdrops go too, so the transcript sits on the host page
    // and only element surfaces (bubbles, composer input) keep their color.
    expect(container?.style.background).toBe("transparent");
    expect(bodyOf(mount)?.style.background).toBe("transparent");
    expect(footerOf(mount)?.style.background).toBe("transparent");
    expect(footerOf(mount)?.style.borderTopStyle).toBe("none");
    expect(wrapperOf(mount).style.background).toContain("--persona-panel-canvas-bg");
    // No whole-split perimeter inset: the chat is flush to the container edges.
    expect(wrapperOf(mount).style.padding).toBe("");

    controller.destroy();
  });

  it("keeps two matched cards and pads the wrapper in the default card surface", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, flushConfig("card"));

    openArtifact(controller);

    const container = containerOf(mount);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(false);
    // Chat column carries its own card chrome.
    expect(container?.style.border).toContain("--persona-panel-border");
    expect(container?.style.boxShadow).toContain("--persona-artifact-pane-shadow");
    expect(container?.style.background).toBe("");
    expect(bodyOf(mount)?.style.background).toBe("");
    expect(footerOf(mount)?.style.background).toBe("");
    // Perimeter inset still pads the whole split.
    expect(wrapperOf(mount).style.padding).toBe("var(--persona-panel-inset)");

    controller.destroy();
  });

  it("applies the flush chrome while idle, before any artifact opens", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, flushConfig("flush"));

    const container = containerOf(mount);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(true);
    expect(container?.style.borderStyle).toBe("none");
    expect(container?.style.borderRadius).toBe("0px");
    expect(container?.style.background).toBe("transparent");
    expect(bodyOf(mount)?.style.background).toBe("transparent");
    expect(footerOf(mount)?.style.background).toBe("transparent");
    expect(wrapperOf(mount).style.background).toContain("--persona-panel-canvas-bg");
    expect(wrapperOf(mount).style.padding).toBe("");

    controller.destroy();
  });

  it("keeps the flush chrome after the pane closes", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, flushConfig("flush"));

    openArtifact(controller);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(true);

    controller.hideArtifacts();

    const container = containerOf(mount);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    // Flush is a steady state: closing the pane never flips the chat chrome.
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(true);
    expect(container?.style.borderRadius).toBe("0px");
    expect(container?.style.background).toBe("transparent");
    expect(bodyOf(mount)?.style.background).toBe("transparent");
    expect(footerOf(mount)?.style.background).toBe("transparent");
    expect(wrapperOf(mount).style.background).toContain("--persona-panel-canvas-bg");

    controller.destroy();
  });

  it("is a no-op with a non-detached appearance (welded panel)", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          // Default panel appearance welds into one card; flush requires detached.
          layout: { chatSurface: "flush" },
        },
      },
    });

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(false);

    controller.destroy();
  });

  it("falls back to the card look for a non-inline (docked) detached split", () => {
    // Flush is gated to inline embeds, matching the card-mode perimeter inset:
    // a docked launcher (isInlineEmbed false, dockedMode true) must ignore
    // chatSurface: 'flush' and keep the chat's card chrome.
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "docked" },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          layout: { paneAppearance: "detached", chatSurface: "flush" },
        },
      },
    });

    openArtifact(controller);

    const container = containerOf(mount);
    // Detached split is active, but flush is suppressed off the inline path.
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(true);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(false);
    // Chat keeps its card chrome instead of the flat flush 'none'.
    expect(container?.style.border).not.toBe("none");
    expect(container?.style.border).toContain("--persona-panel-border");

    controller.destroy();
  });

  const panelOf = (mount: HTMLElement) =>
    mount.querySelector<HTMLElement>(".persona-artifact-split-root")
      ?.parentElement as HTMLElement | null;

  it("squares the outer panel in flush mode when panel.borderRadius is unset", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, flushConfig("flush"));

    openArtifact(controller);

    const panel = panelOf(mount);
    // Panel fills the container flush, so it squares off; the pane keeps its radius.
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(true);
    expect(panel?.style.borderRadius).toBe("0px");

    controller.destroy();
  });

  it("keeps an explicit panel.borderRadius in flush mode", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      theme: { components: { panel: { borderRadius: "16px" } } },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          layout: { paneAppearance: "detached", chatSurface: "flush" },
        },
      },
    });

    openArtifact(controller);

    const panel = panelOf(mount);
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(true);
    // Explicit override wins over the auto-square default.
    expect(panel?.style.borderRadius).toBe("16px");

    controller.destroy();
  });

  it("does not square the panel for a card-surface detached split", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, flushConfig("card"));

    openArtifact(controller);

    const panel = panelOf(mount);
    // Card mode keeps the floating panel radius, not the flush square.
    expect(mount.classList.contains("persona-artifact-chat-flush")).toBe(false);
    expect(panel?.style.borderRadius).not.toBe("0px");

    controller.destroy();
  });
});

describe("createAgentExperience welded artifact split chrome", () => {
  beforeEach(() => {
    // Desktop viewport so the split renders side-by-side (not the narrow drawer).
    setInnerWidth(1024);
    // Artifacts persist to the shared default history key; clear it so a fresh
    // widget starts pane-closed instead of restoring a prior test's artifact.
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setInnerWidth(originalInnerWidth);
    localStorage.clear();
  });

  const weldedConfig = (
    layout: NonNullable<
      NonNullable<AgentWidgetConfig["features"]>["artifacts"]
    >["layout"] = {},
    theme?: AgentWidgetConfig["theme"]
  ): AgentWidgetConfig => ({
    apiUrl: "https://api.example.com/chat",
    // Floating launcher (default): the panel is an elevated card, so the outer
    // union shadow is present and the welded border can move onto it.
    ...(theme ? { theme } : {}),
    features: {
      artifacts: { enabled: true, allowedTypes: ["markdown"], layout },
    },
  });

  const splitRefs = (mount: HTMLElement) => {
    const container = mount.querySelector<HTMLElement>(".persona-widget-container");
    const split = mount.querySelector<HTMLElement>(".persona-artifact-split-root");
    return {
      panel: (split?.parentElement ?? container?.parentElement ?? null) as HTMLElement | null,
      container,
    };
  };

  const openArtifact = (controller: ReturnType<typeof createAgentExperience>) => {
    controller.upsertArtifact({
      id: "welded-test",
      title: "Welded test",
      artifactType: "markdown",
      content: "# Hello",
    });
  };

  it("welds panel appearance: border + radius move onto the union, chat column goes borderless", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, weldedConfig());
    const { panel, container } = splitRefs(mount);

    // Pane closed: the chat container carries the card border, the panel does not.
    expect(container?.style.border).toContain("--persona-panel-border");
    expect(panel?.style.border).toBe("");

    openArtifact(controller);

    // Welded split active: one card. Border + radius wrap the union (on the
    // panel); the chat column drops its own border; the outer shadow survives.
    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(true);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);
    expect(panel?.style.border).toContain("--persona-panel-border");
    expect(panel?.style.borderRadius).not.toBe("");
    expect(panel?.style.boxShadow).not.toBe("none");
    expect(container?.style.border).not.toContain("--persona-panel-border");
    expect(mount.classList.contains("persona-artifact-appearance-panel")).toBe(true);

    controller.destroy();
  });

  it("welds seamless appearance the same way (union chrome, no divider class differences aside)", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, weldedConfig({ paneAppearance: "seamless" }));
    const { panel, container } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(true);
    expect(panel?.style.border).toContain("--persona-panel-border");
    expect(container?.style.border).not.toContain("--persona-panel-border");
    // Seamless keeps the shared welded chrome; the divider is suppressed in CSS.
    expect(mount.classList.contains("persona-artifact-appearance-seamless")).toBe(true);

    controller.destroy();
  });

  it("restores the chat-column border and clears the welded class when the pane closes", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, weldedConfig());
    const { panel, container } = splitRefs(mount);

    openArtifact(controller);
    expect(container?.style.border).not.toContain("--persona-panel-border");

    controller.hideArtifacts();

    // Byte-identical to pane-closed: container carries the border, panel does not.
    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(false);
    expect(container?.style.border).toContain("--persona-panel-border");
    expect(panel?.style.border).toBe("");

    controller.destroy();
  });

  it("lets an explicit paneBorder win over the welded default", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      weldedConfig({ paneBorder: "2px solid #abcabc" })
    );
    openArtifact(controller);

    // The pane border theme class + var are still applied under the welded split,
    // so a configured border overrides the hairline divider default.
    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(true);
    expect(mount.classList.contains("persona-artifact-border-full")).toBe(true);
    expect(
      mount.style.getPropertyValue("--persona-artifact-pane-border").trim()
    ).toBe("2px solid #abcabc");

    controller.destroy();
  });

  it("does not weld on a mobile viewport (drawer overlay, not a split)", () => {
    setInnerWidth(480);
    const mount = createMount();
    // Inline embed keeps the launcher off so mobile does not force fullscreen.
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    });
    const { container } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(false);
    // Below the breakpoint the chat column keeps its own border.
    expect(container?.style.border).not.toBe("none");

    controller.destroy();
  });

  it("does not weld in mobile fullscreen driven by a custom mobileBreakpoint", () => {
    // 700px is a desktop-split width by the 641 breakpoint, but a launcher with
    // mobileBreakpoint:768 goes fullscreen here, so the split chrome must stand down.
    setInnerWidth(700);
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mobileBreakpoint: 768 },
      features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    });

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(false);
    expect(mount.classList.contains("persona-artifact-detached-split")).toBe(false);

    controller.destroy();
  });

  it("welds again after a custom-breakpoint fullscreen viewport widens", () => {
    setInnerWidth(700);
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mobileBreakpoint: 768 },
      features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    });

    openArtifact(controller);
    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(false);

    // Cross above the custom breakpoint: the resize resync re-applies split chrome.
    setInnerWidth(900);
    window.dispatchEvent(new Event("resize"));

    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(true);

    controller.destroy();
  });

  it("gives a docked welded split the dock-facing hairline on the outer panel", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "docked", dock: { side: "right" } },
      features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    });
    const { panel } = splitRefs(mount);

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(true);
    // Right dock: the page sits to the left, so the hairline faces left.
    expect(panel?.style.borderLeft).toContain("var(--persona-border)");

    controller.destroy();
  });

  it("derives the welded outer radius from a custom components.panel.borderRadius", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      weldedConfig({}, { components: { panel: { borderRadius: "1.75rem" } } })
    );

    openArtifact(controller);

    expect(mount.classList.contains("persona-artifact-welded-split")).toBe(true);
    // Both the chat card left corners and the pane outer-right corners resolve
    // from the same panel radius, so the welded card is symmetric.
    expect(
      mount.style.getPropertyValue("--persona-artifact-welded-outer-radius").trim()
    ).toBe("1.75rem");

    controller.destroy();
  });

  it("lets unifiedSplitOuterRadius override the welded outer radius", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      weldedConfig({ unifiedSplitOuterRadius: "9px" })
    );

    openArtifact(controller);

    expect(
      mount.style.getPropertyValue("--persona-artifact-welded-outer-radius").trim()
    ).toBe("9px");

    controller.destroy();
  });
});
