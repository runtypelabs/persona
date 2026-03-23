// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

const createAgentExperienceMock = vi.fn();

vi.mock("../ui", () => ({
  createAgentExperience: createAgentExperienceMock,
}));

function createMockController(config?: { launcher?: { enabled?: boolean; autoExpand?: boolean } }) {
  let open = (config?.launcher?.enabled ?? true) ? (config?.launcher?.autoExpand ?? false) : true;
  const launcherEnabled = config?.launcher?.enabled ?? true;
  const listeners = new Map<string, Set<Listener>>();

  const emit = (event: string) => {
    const handlers = listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => handler());
  };

  return {
    update: vi.fn(),
    destroy: vi.fn(),
    getState: vi.fn(() => ({
      open: launcherEnabled && open,
      launcherEnabled,
      voiceActive: false,
      streaming: false,
    })),
    on: vi.fn((event: string, handler: Listener) => {
      const handlers = listeners.get(event) ?? new Set<Listener>();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => {
        handlers.delete(handler);
      };
    }),
    off: vi.fn(),
    open: vi.fn(() => {
      open = true;
      emit("widget:opened");
    }),
    close: vi.fn(() => {
      open = false;
      emit("widget:closed");
    }),
    toggle: vi.fn(() => {
      open = !open;
      emit(open ? "widget:opened" : "widget:closed");
    }),
    clearChat: vi.fn(),
    isOpen: vi.fn(() => open),
    isVoiceActive: vi.fn(() => false),
    getMessages: vi.fn(() => []),
    getStatus: vi.fn(() => "idle"),
    getPersistentMetadata: vi.fn(() => ({})),
    updatePersistentMetadata: vi.fn(),
    showCSATFeedback: vi.fn(),
    submitCSATFeedback: vi.fn(),
    showNPSFeedback: vi.fn(),
    submitNPSFeedback: vi.fn(),
    injectMessage: vi.fn(),
    injectAssistantMessage: vi.fn(),
    injectUserMessage: vi.fn(),
    injectSystemMessage: vi.fn(),
    injectMessageBatch: vi.fn(),
    getMessageById: vi.fn(),
    getLastMessage: vi.fn(),
    focusInput: vi.fn(),
    setComposerText: vi.fn(),
    getComposerText: vi.fn(),
    submitComposerText: vi.fn(),
    showEventStream: vi.fn(),
    hideEventStream: vi.fn(),
    isEventStreamVisible: vi.fn(() => false),
    startVoiceRecognition: vi.fn(() => false),
    stopVoiceRecognition: vi.fn(() => false),
    showArtifacts: vi.fn(),
    hideArtifacts: vi.fn(),
    clearArtifacts: vi.fn(),
    onArtifactSelect: vi.fn(),
  };
}

describe("initAgentWidget docked mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createAgentExperienceMock.mockReset();
    createAgentExperienceMock.mockImplementation((_mount, config) => createMockController(config));
  });

  it("wraps the target in a dock shell and restores it on destroy", async () => {
    const { initAgentWidget } = await import("./init");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<div id="content">Workspace</div>`;
    document.body.appendChild(wrapper);
    const target = wrapper.querySelector<HTMLElement>("#content")!;

    const handle = initAgentWidget({
      target,
      config: {
        launcher: {
          mountMode: "docked",
          dock: { width: "420px" },
        },
      },
    });

    const shell = wrapper.querySelector<HTMLElement>('[data-persona-host-layout="docked"]');
    expect(shell).not.toBeNull();
    expect(shell?.querySelector('[data-persona-dock-role="content"]')?.firstElementChild).toBe(target);
    expect(shell?.querySelector('[data-persona-dock-role="panel"]')).not.toBeNull();
    expect(handle.host).toBe(shell?.querySelector('[data-persona-dock-role="host"]'));

    handle.destroy();

    expect(wrapper.firstElementChild).toBe(target);
    expect(wrapper.querySelector('[data-persona-host-layout="docked"]')).toBeNull();
  });

  it("rejects body as a docked target", async () => {
    const { initAgentWidget } = await import("./init");

    expect(() =>
      initAgentWidget({
        target: document.body,
        config: {
          launcher: {
            mountMode: "docked",
          },
        },
      })
    ).toThrow('Docked widget target must be a concrete container element');
  });

  it("updates dock width on open and close events", async () => {
    const { initAgentWidget } = await import("./init");
    document.body.innerHTML = `<div id="content">Workspace</div>`;

    const handle = initAgentWidget({
      target: "#content",
      config: {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          dock: { width: "400px" },
        },
      },
    });

    const panelSlot = document.querySelector<HTMLElement>('[data-persona-dock-role="panel"]')!;
    expect(panelSlot.style.width).toBe("400px");

    handle.close();
    expect(panelSlot.style.width).toBe("0px");

    handle.open();
    expect(panelSlot.style.width).toBe("400px");
  });

  it("overlay dock reveal keeps width and uses transform when closing", async () => {
    const { initAgentWidget } = await import("./init");
    document.body.innerHTML = `<div id="content">Workspace</div>`;

    const handle = initAgentWidget({
      target: "#content",
      config: {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          dock: { width: "400px", reveal: "overlay" },
        },
      },
    });

    const panelSlot = document.querySelector<HTMLElement>('[data-persona-dock-role="panel"]')!;
    expect(panelSlot.style.width).toBe("400px");

    handle.close();
    expect(panelSlot.style.width).toBe("400px");
    expect(panelSlot.style.transform).toBe("translateX(100%)");

    handle.open();
    expect(panelSlot.style.transform).toBe("translateX(0)");

    handle.destroy();
  });

  it("push dock reveal translates the push-track; panel keeps width when closing", async () => {
    const { initAgentWidget } = await import("./init");
    const wrapper = document.createElement("div");
    wrapper.style.width = "900px";
    document.body.appendChild(wrapper);
    wrapper.innerHTML = `<div id="content">Workspace</div>`;

    const handle = initAgentWidget({
      target: "#content",
      config: {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          dock: { width: "400px", reveal: "push" },
        },
      },
    });

    const shell = document.querySelector<HTMLElement>('[data-persona-host-layout="docked"]')!;
    Object.defineProperty(shell, "clientWidth", { get: () => 900, configurable: true });
    handle.update({
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: { width: "400px", reveal: "push" },
      },
    });

    const pushTrack = shell.querySelector<HTMLElement>('[data-persona-dock-role="push-track"]');
    const panelSlot = shell.querySelector<HTMLElement>('[data-persona-dock-role="panel"]')!;
    expect(pushTrack).not.toBeNull();
    expect(panelSlot.style.width).toBe("400px");
    expect(pushTrack?.style.transform).toBe("translateX(-400px)");

    handle.close();
    expect(panelSlot.style.width).toBe("400px");
    expect(pushTrack?.style.transform).toBe("translateX(0)");

    handle.destroy();
    wrapper.remove();
  });

  it("rebuilds when mount mode changes from floating to docked", async () => {
    const { initAgentWidget } = await import("./init");
    document.body.innerHTML = `<div id="content">Workspace</div>`;

    const handle = initAgentWidget({
      target: "#content",
      config: {
        launcher: {
          mountMode: "floating",
        },
      },
    });

    expect(createAgentExperienceMock).toHaveBeenCalledTimes(1);
    handle.update({
      launcher: {
        mountMode: "docked",
        dock: { side: "left", width: "460px" },
      },
    });

    expect(createAgentExperienceMock).toHaveBeenCalledTimes(2);
    const shell = document.querySelector<HTMLElement>('[data-persona-host-layout="docked"]');
    expect(shell).not.toBeNull();
    expect(shell?.firstElementChild?.getAttribute("data-persona-dock-role")).toBe("panel");
  });

  it("updates dock config in place without rebuilding the controller", async () => {
    const { initAgentWidget } = await import("./init");
    document.body.innerHTML = `<div id="content">Workspace</div>`;

    const handle = initAgentWidget({
      target: "#content",
      config: {
        launcher: {
          mountMode: "docked",
          dock: { side: "right", width: "420px" },
        },
      },
    });

    expect(createAgentExperienceMock).toHaveBeenCalledTimes(1);
    handle.update({
      launcher: {
        dock: { side: "left", width: "500px" },
      },
    });

    expect(createAgentExperienceMock).toHaveBeenCalledTimes(1);
    const shell = document.querySelector<HTMLElement>('[data-persona-host-layout="docked"]');
    const panelSlot = document.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(shell?.firstElementChild?.getAttribute("data-persona-dock-role")).toBe("panel");
    expect(panelSlot?.style.width).toBe("0px");
  });

  it("supports shadow DOM hosts in docked mode", async () => {
    const { initAgentWidget } = await import("./init");
    document.body.innerHTML = `<div id="content">Workspace</div>`;

    const handle = initAgentWidget({
      target: "#content",
      useShadowDom: true,
      config: {
        launcher: {
          mountMode: "docked",
        },
      },
    });

    expect(handle.host.shadowRoot).not.toBeNull();
    expect(handle.host.shadowRoot?.querySelector("[data-persona-root]")).not.toBeNull();
  });

  it("mounts two widgets with independent roots in light DOM", async () => {
    const { initAgentWidget } = await import("./init");
    document.body.innerHTML = `
      <div id="widget-a"></div>
      <div id="widget-b"></div>
    `;

    const handleA = initAgentWidget({
      target: "#widget-a",
      config: {
        launcher: { enabled: false },
      },
    });

    const handleB = initAgentWidget({
      target: "#widget-b",
      config: {
        launcher: { enabled: false },
      },
    });

    const roots = document.querySelectorAll("[data-persona-root]");
    expect(roots.length).toBe(2);

    // Each root should be inside its respective target
    const rootA = document.querySelector("#widget-a [data-persona-root]");
    const rootB = document.querySelector("#widget-b [data-persona-root]");
    expect(rootA).not.toBeNull();
    expect(rootB).not.toBeNull();
    expect(rootA).not.toBe(rootB);

    handleA.destroy();
    handleB.destroy();
  });
});
