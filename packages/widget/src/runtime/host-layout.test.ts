// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { createWidgetHostLayout } from "./host-layout";

describe("createWidgetHostLayout docked", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reserves no dock column when panel is closed (always 0px)", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const layout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: false,
        dock: { width: "320px" },
      },
    });

    const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(dockSlot).not.toBeNull();
    expect(dockSlot?.style.minWidth).toBe("0px");
    expect(dockSlot?.style.overflow).toBe("hidden");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(dockSlot?.style.width).toBe("320px");
    expect(dockSlot?.style.overflow).toBe("visible");

    layout.syncWidgetState({ open: false, launcherEnabled: true });
    expect(dockSlot?.style.minWidth).toBe("0px");
    expect(dockSlot?.style.overflow).toBe("hidden");

    layout.destroy();
  });

  it("disables dock width transition when dock.animate is false", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const layout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: false,
        dock: { width: "320px", animate: false },
      },
    });

    const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(dockSlot?.style.transition).toBe("none");

    layout.destroy();
  });

  it("overlay reveal keeps panel width and translates off-screen when closed", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const layout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: false,
        dock: { width: "320px", reveal: "overlay" },
      },
    });

    const shell = layout.shell;
    const dockSlot = shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(shell?.dataset.personaDockReveal).toBe("overlay");
    expect(shell?.style.overflow).toBe("hidden");
    expect(dockSlot?.style.width).toBe("320px");
    expect(dockSlot?.style.transform).toBe("translateX(100%)");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(dockSlot?.style.width).toBe("320px");
    expect(dockSlot?.style.transform).toBe("translateX(0)");

    layout.destroy();
  });

  it("overlay reveal uses translateX(-100%) on the left side when closed", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const layout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: false,
        dock: { width: "300px", side: "left", reveal: "overlay" },
      },
    });

    const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(dockSlot?.style.transform).toBe("translateX(-100%)");
    expect(dockSlot?.style.left).toBe("0px");

    layout.destroy();
  });

  it("push reveal translates a track; main column width stays fixed in px", () => {
    const parent = document.createElement("div");
    parent.style.width = "800px";
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const dockConfig = {
      mountMode: "docked" as const,
      autoExpand: false,
      dock: { width: "320px", reveal: "push" as const },
    };

    const layout = createWidgetHostLayout(target, { launcher: dockConfig });
    const shell = layout.shell!;
    Object.defineProperty(shell, "clientWidth", { get: () => 800, configurable: true });
    layout.updateConfig({ launcher: dockConfig });

    const pushTrack = shell.querySelector<HTMLElement>('[data-persona-dock-role="push-track"]');
    const contentSlot = shell.querySelector<HTMLElement>('[data-persona-dock-role="content"]');
    expect(pushTrack).not.toBeNull();
    expect(shell.dataset.personaDockReveal).toBe("push");
    expect(contentSlot?.style.width).toBe("800px");
    expect(pushTrack?.style.width).toBe("1120px");
    expect(pushTrack?.style.transform).toBe("translateX(0)");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(pushTrack?.style.transform).toBe("translateX(-320px)");

    layout.destroy();
  });

  it("push reveal on the left uses negative translate when closed", () => {
    const parent = document.createElement("div");
    parent.style.width = "600px";
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const dockConfig = {
      mountMode: "docked" as const,
      autoExpand: false,
      dock: { width: "200px", side: "left" as const, reveal: "push" as const },
    };

    const layout = createWidgetHostLayout(target, { launcher: dockConfig });
    const shell = layout.shell!;
    Object.defineProperty(shell, "clientWidth", { get: () => 600, configurable: true });
    layout.updateConfig({ launcher: dockConfig });

    const pushTrack = shell.querySelector<HTMLElement>('[data-persona-dock-role="push-track"]');
    expect(pushTrack?.style.transform).toBe("translateX(-200px)");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(pushTrack?.style.transform).toBe("translateX(0)");

    layout.destroy();
  });

  it("emerge reveal keeps host width at dock.width while the column animates like resize", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const layout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: false,
        dock: { width: "320px", reveal: "emerge" },
      },
    });

    const host = layout.host;
    const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(layout.shell?.dataset.personaDockReveal).toBe("emerge");
    expect(dockSlot?.style.minWidth).toBe("0px");
    expect(host.style.width).toBe("320px");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(dockSlot?.style.minWidth).toBe("320px");
    expect(host.style.width).toBe("320px");

    layout.destroy();
  });

  const withInnerWidth = (width: number, fn: () => void): void => {
    const prev = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      fn();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: prev,
      });
    }
  };

  it("uses fixed fullscreen dock slot on mobile viewport when open", () => {
    withInnerWidth(500, () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: { width: "320px" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      layout.syncWidgetState({ open: true, launcherEnabled: true });
      expect(dockSlot?.style.position).toBe("fixed");
      expect(dockSlot?.style.zIndex).toBe("9999");
      expect(layout.shell?.dataset.personaDockMobileFullscreen).toBe("true");

      layout.destroy();
    });
  });

  it("does not use fixed fullscreen above mobile breakpoint", () => {
    withInnerWidth(800, () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: { width: "320px", reveal: "overlay" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      layout.syncWidgetState({ open: true, launcherEnabled: true });
      expect(dockSlot?.style.position).toBe("absolute");
      expect(layout.shell?.dataset.personaDockMobileFullscreen).toBeUndefined();

      layout.destroy();
    });
  });

  it("respects mobileFullscreen: false on narrow viewport", () => {
    withInnerWidth(500, () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          mobileFullscreen: false,
          dock: { width: "320px" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      layout.syncWidgetState({ open: true, launcherEnabled: true });
      expect(dockSlot?.style.position).toBe("relative");
      expect(layout.shell?.dataset.personaDockMobileFullscreen).toBeUndefined();

      layout.destroy();
    });
  });

  it("respects custom mobileBreakpoint", () => {
    withInnerWidth(900, () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          mobileBreakpoint: 1024,
          dock: { width: "320px" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      layout.syncWidgetState({ open: true, launcherEnabled: true });
      expect(dockSlot?.style.position).toBe("fixed");

      layout.destroy();
    });
  });

  it("does not use fixed fullscreen when panel is closed on mobile", () => {
    withInnerWidth(500, () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: { width: "320px" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      layout.syncWidgetState({ open: false, launcherEnabled: true });
      expect(dockSlot?.style.position).toBe("relative");

      layout.destroy();
    });
  });
});
