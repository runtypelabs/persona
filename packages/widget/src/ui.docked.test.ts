// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { createWidgetHostLayout } from "./runtime/host-layout";
import { createAgentExperience } from "./ui";

describe("createAgentExperience docked mode", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("toggles docked panel open/closed; built-in launcher stays hidden (open via controller.open)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
        },
      },
    });

    const wrapper = mount.firstElementChild as HTMLElement | null;
    const launcherButton = mount.lastElementChild as HTMLButtonElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.display).toBe("flex");
    expect(launcherButton).not.toBeNull();
    expect(launcherButton?.tagName).toBe("BUTTON");
    expect(launcherButton?.style.display).toBe("none");
    expect(launcherButton?.className).toContain("persona-mt-4");

    controller.close();

    expect(wrapper?.style.display).toBe("none");
    expect(launcherButton?.style.display).toBe("none");

    controller.open();

    expect(wrapper?.style.display).toBe("flex");
    expect(launcherButton?.style.display).toBe("none");

    controller.destroy();
  });

  it("keeps docked panel hidden when closed under mobile fullscreen breakpoint", () => {
    const prevWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 480,
      });

      const mount = document.createElement("div");
      document.body.appendChild(mount);

      const controller = createAgentExperience(mount, {
        apiUrl: "https://api.example.com/chat",
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: {
            side: "right",
            width: "420px",
          },
        },
      });

      const wrapper = mount.firstElementChild as HTMLElement | null;
      expect(wrapper?.style.display).toBe("none");
      expect(getComputedStyle(wrapper!).display).toBe("none");

      controller.open();
      expect(wrapper?.style.display).toBe("flex");

      controller.destroy();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: prevWidth,
      });
    }
  });

  it("keeps docked panel hidden after resize into mobile when closed", () => {
    const prevWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 900,
      });

      const mount = document.createElement("div");
      document.body.appendChild(mount);

      const controller = createAgentExperience(mount, {
        apiUrl: "https://api.example.com/chat",
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: {
            side: "right",
            width: "420px",
          },
        },
      });

      const wrapper = mount.firstElementChild as HTMLElement | null;
      expect(wrapper?.style.display).toBe("none");

      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 480,
      });
      window.dispatchEvent(new Event("resize"));

      expect(wrapper?.style.display).toBe("none");

      controller.destroy();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: prevWidth,
      });
    }
  });

  it("collapses the dock width to 0 when the header close button is clicked", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const hostLayout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
        },
      },
    });
    const mount = document.createElement("div");
    hostLayout.host.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
        },
      },
    });

    const syncDockState = () => hostLayout.syncWidgetState(controller.getState());
    const openUnsub = controller.on("widget:opened", syncDockState);
    const closeUnsub = controller.on("widget:closed", syncDockState);
    syncDockState();

    const dockSlot = hostLayout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    const closeButton = mount.querySelector<HTMLButtonElement>('[aria-label="Close chat"]');

    expect(dockSlot?.style.width).toBe("420px");
    expect(closeButton).not.toBeNull();

    closeButton!.click();

    expect(dockSlot?.style.width).toBe("0px");

    openUnsub();
    closeUnsub();
    controller.destroy();
    hostLayout.destroy();
  });

  it("overlay reveal keeps width when closed; host-layout uses transform", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const hostLayout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
          reveal: "overlay",
        },
      },
    });
    const mount = document.createElement("div");
    hostLayout.host.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
          reveal: "overlay",
        },
      },
    });

    const syncDockState = () => hostLayout.syncWidgetState(controller.getState());
    const openUnsub = controller.on("widget:opened", syncDockState);
    const closeUnsub = controller.on("widget:closed", syncDockState);
    syncDockState();

    const dockSlot = hostLayout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    const closeButton = mount.querySelector<HTMLButtonElement>('[aria-label="Close chat"]');

    expect(dockSlot?.style.width).toBe("420px");
    expect(closeButton).not.toBeNull();

    closeButton!.click();

    expect(dockSlot?.style.width).toBe("420px");
    expect(dockSlot?.style.transform).toBe("translateX(100%)");

    openUnsub();
    closeUnsub();
    controller.destroy();
    hostLayout.destroy();
  });

  it("push reveal translates the push-track when the header close button is clicked", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const hostLayout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
          reveal: "push",
        },
      },
    });
    const shell = hostLayout.shell!;
    Object.defineProperty(shell, "clientWidth", { get: () => 1000, configurable: true });
    hostLayout.updateConfig({
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: { side: "right", width: "420px", reveal: "push" },
      },
    });

    const mount = document.createElement("div");
    hostLayout.host.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
          reveal: "push",
        },
      },
    });

    const syncDockState = () => hostLayout.syncWidgetState(controller.getState());
    const openUnsub = controller.on("widget:opened", syncDockState);
    const closeUnsub = controller.on("widget:closed", syncDockState);
    syncDockState();

    const pushTrack = shell.querySelector<HTMLElement>('[data-persona-dock-role="push-track"]');
    const closeButton = mount.querySelector<HTMLButtonElement>('[aria-label="Close chat"]');

    expect(pushTrack).not.toBeNull();
    expect(pushTrack?.style.transform).toBe("translateX(-420px)");

    closeButton!.click();

    expect(pushTrack?.style.transform).toBe("translateX(0)");

    openUnsub();
    closeUnsub();
    controller.destroy();
    hostLayout.destroy();
  });
});
