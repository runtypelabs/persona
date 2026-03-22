// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { createWidgetHostLayout } from "./runtime/host-layout";
import { createAgentExperience } from "./ui";

describe("createAgentExperience docked mode", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collapses the docked panel wrapper and keeps the rail trigger visible when closed", () => {
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
          collapsedWidth: "72px",
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
    expect(launcherButton?.style.display).toBe("");

    controller.open();

    expect(wrapper?.style.display).toBe("flex");
    expect(launcherButton?.style.display).toBe("none");

    controller.destroy();
  });

  it("collapses the dock width when the header close button is clicked", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const hostLayout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: true,
        dock: {
          side: "right",
          width: "420px",
          collapsedWidth: "72px",
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
          collapsedWidth: "72px",
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

    expect(dockSlot?.style.width).toBe("72px");

    openUnsub();
    closeUnsub();
    controller.destroy();
    hostLayout.destroy();
  });
});
