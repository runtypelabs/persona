// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config?: Partial<AgentWidgetConfig>) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as AgentWidgetConfig);
  controllers.push(controller);
  return { mount, controller };
};

const userMessage = (id = "u1"): AgentWidgetMessage => ({
  id,
  role: "user",
  content: "hello",
  createdAt: "2026-08-01T00:00:00.000Z",
  streaming: false,
});

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  mounts.splice(0).forEach((mount) => mount.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("composer placement attributes", () => {
  it("resolves block and an empty conversation by default", () => {
    const { mount } = makeController();
    expect(mount.getAttribute("data-persona-composer-placement")).toBe("block");
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("bottom");
  });

  it("mirrors the welcome anchor and composerGap onto the root under block", () => {
    const { mount } = makeController({
      welcome: { anchor: "center", composerGap: "40px" },
    });
    expect(mount.getAttribute("data-persona-composer-placement")).toBe("block");
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("center");
    // The block+center gap rules read this var; the overlay path shares it.
    expect(mount.style.getPropertyValue("--persona-composer-anchor-gap")).toBe(
      "40px"
    );
  });

  it("flips the root attribute for placement overlay and publishes the height var", () => {
    const { mount } = makeController({ composer: { placement: "overlay" } });
    expect(mount.getAttribute("data-persona-composer-placement")).toBe(
      "overlay"
    );
    // jsdom measures no layout, so the documented degradation is 0px.
    expect(mount.style.getPropertyValue("--persona-composer-overlay-height")).toBe(
      "0px"
    );
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("0px");
  });

  it("keeps block in composer-bar mount mode and warns once under debug", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mount, controller } = makeController({
      debug: true,
      launcher: { mountMode: "composer-bar" },
      composer: { placement: "overlay" },
    });
    expect(mount.getAttribute("data-persona-composer-placement")).toBe("block");
    controller.update({ debug: true });
    const placementWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("composer.placement is ignored")
    );
    expect(placementWarnings).toHaveLength(1);
  });

  it("publishes the resolved welcome gap under its own alias", () => {
    const { mount } = makeController({
      welcome: { anchor: "center", composerGap: "16px" },
    });
    expect(mount.style.getPropertyValue("--persona-composer-anchor-gap")).toBe(
      "16px"
    );
    // components.composer.gap keeps --persona-composer-gap to itself.
    expect(mount.style.getPropertyValue("--persona-composer-gap")).toBe(
      "0.5rem"
    );
  });
});

describe("welcome anchor", () => {
  it("stamps the anchor on the welcome host", () => {
    const { mount } = makeController({ welcome: { anchor: "center" } });
    const host = mount.querySelector<HTMLElement>("[data-persona-welcome]")!;
    expect(host.getAttribute("data-persona-welcome-anchor")).toBe("center");
  });

  it("defaults the host to the bottom anchor", () => {
    const { mount } = makeController();
    const host = mount.querySelector<HTMLElement>("[data-persona-welcome]")!;
    expect(host.getAttribute("data-persona-welcome-anchor")).toBe("bottom");
  });

  it("reverts the anchor on a live update", () => {
    const { mount, controller } = makeController({
      welcome: { anchor: "center" },
    });
    const host = mount.querySelector<HTMLElement>("[data-persona-welcome]")!;
    controller.update({ welcome: { anchor: undefined } });
    expect(host.getAttribute("data-persona-welcome-anchor")).toBe("bottom");
  });
});

describe("conversation state", () => {
  it("flips to active on an injected user message and back on clearChat", () => {
    const { mount, controller } = makeController();
    controller.injectUserMessage({ content: "hello" });
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("active");
    controller.clearChat();
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
  });

  it("stays empty for an assistant-only transcript", () => {
    const { mount } = makeController();
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
    controllers[controllers.length - 1]!.injectAssistantMessage({
      content: "hi there",
    });
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
  });

  it("paints restored history as active without animating the drop", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    const original = (Element.prototype as { animate?: unknown }).animate;
    (Element.prototype as { animate?: unknown }).animate = animate;
    try {
      const { mount } = makeController({
        welcome: { anchor: "center", variant: "hero" },
        initialMessages: [userMessage()],
      });
      expect(mount.getAttribute("data-persona-conversation-state")).toBe(
        "active"
      );
      expect(animate).not.toHaveBeenCalled();
    } finally {
      (Element.prototype as { animate?: unknown }).animate = original;
    }
  });
});

describe("observer lifecycle", () => {
  it("disconnects the composer observer on destroy", () => {
    const disconnect = vi.fn();
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const { controller } = makeController();
    disconnect.mockClear();
    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);
    expect(disconnect).toHaveBeenCalled();
  });
});
