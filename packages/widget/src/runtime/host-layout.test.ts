// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("push reveal offsets a track with margin (no transform); main column width stays fixed in px", () => {
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
    expect(pushTrack?.style.marginLeft).toBe("0px");
    // The track must NOT carry a transform: a transformed ancestor becomes the
    // containing block for `position: fixed` host chrome and pushes it
    // off-screen (regression guard, see host-layout.ts push branch).
    expect(pushTrack?.style.transform).toBe("");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(pushTrack?.style.marginLeft).toBe("-320px");
    expect(pushTrack?.style.transform).toBe("");

    layout.destroy();
  });

  it("push reveal on the left uses negative margin when closed", () => {
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
    expect(pushTrack?.style.marginLeft).toBe("-200px");
    expect(pushTrack?.style.transform).toBe("");

    layout.syncWidgetState({ open: true, launcherEnabled: true });
    expect(pushTrack?.style.marginLeft).toBe("0px");
    expect(pushTrack?.style.transform).toBe("");

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

  it("clamps the dock slot to the viewport guard and pins resize/emerge sticky", () => {
    for (const reveal of ["resize", "emerge"] as const) {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: { width: "320px", reveal },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      expect(dockSlot?.style.maxHeight, reveal).not.toBe("");
      expect(dockSlot?.style.position, reveal).toBe("sticky");
      expect(dockSlot?.style.top, reveal).toBe("0px");

      layout.destroy();
      document.body.innerHTML = "";
    }
  });

  it("clamps push and overlay dock slots without sticky (in-flow/absolute contexts)", () => {
    // push: the slot is an in-flow `position: relative` column: max-height cap
    // only, no sticky. overlay: keeps absolute positioning.
    const cases = [
      { reveal: "push" as const, position: "relative" },
      { reveal: "overlay" as const, position: "absolute" },
    ];
    for (const { reveal, position } of cases) {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: false,
          dock: { width: "320px", reveal },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      expect(dockSlot?.style.maxHeight, reveal).not.toBe("");
      expect(dockSlot?.style.position, reveal).toBe(position);

      layout.destroy();
      document.body.innerHTML = "";
    }
  });

  it("honors a custom dock.maxHeight and the false opt-out", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const dockConfig = {
      mountMode: "docked" as const,
      autoExpand: false,
      dock: { width: "320px", maxHeight: "600px" },
    };
    const layout = createWidgetHostLayout(target, { launcher: dockConfig });

    const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
    expect(dockSlot?.style.maxHeight).toBe("600px");

    layout.updateConfig({
      launcher: { ...dockConfig, dock: { width: "320px", maxHeight: false } },
    });
    expect(dockSlot?.style.maxHeight).toBe("");
    expect(dockSlot?.style.position).toBe("relative");
    expect(dockSlot?.style.top).toBe("");

    layout.destroy();
  });

  describe("height-chain warning", () => {
    const withOffsetHeight = (impl: (el: HTMLElement) => number, fn: () => void): void => {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          return impl(this);
        },
      });
      try {
        fn();
      } finally {
        if (original) {
          Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
        }
      }
    };

    const mountDocked = () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);
      return createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          dock: { width: "320px" },
        },
      });
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("warns once when a percentage height does not resolve against the shell's parent", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Fixed-height probe measures (environment works); 100% probe collapses
      // to 0 (no ancestor provides a definite height).
      withOffsetHeight((el) => (el.style.height === "1px" ? 1 : 0), () => {
        const layout = mountDocked();
        layout.syncWidgetState({ open: false, launcherEnabled: true });
        layout.syncWidgetState({ open: true, launcherEnabled: true });
        layout.destroy();
      });
      const heightWarnings = warn.mock.calls.filter((c) =>
        String(c[0]).includes("definite height")
      );
      expect(heightWarnings).toHaveLength(1);
      expect(String(heightWarnings[0][0])).toContain("100dvh");
    });

    it("does not warn when the height chain resolves", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      withOffsetHeight(() => 1, () => {
        const layout = mountDocked();
        layout.destroy();
      });
      expect(
        warn.mock.calls.filter((c) => String(c[0]).includes("definite height"))
      ).toHaveLength(0);
    });

    it("does not warn when the environment cannot measure layout (jsdom default)", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const layout = mountDocked();
      layout.destroy();
      expect(
        warn.mock.calls.filter((c) => String(c[0]).includes("definite height"))
      ).toHaveLength(0);
    });
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
      expect(dockSlot?.style.zIndex).toBe("100000");
      expect(layout.shell?.dataset.personaDockMobileFullscreen).toBe("true");

      layout.destroy();
    });
  });

  it("resets the push track margin when a desktop push offset enters mobile fullscreen", () => {
    const parent = document.createElement("div");
    parent.style.width = "800px";
    document.body.appendChild(parent);
    const target = document.createElement("div");
    parent.appendChild(target);

    const layout = createWidgetHostLayout(target, {
      launcher: {
        mountMode: "docked",
        autoExpand: false,
        dock: { width: "320px", reveal: "push" },
      },
    });
    const pushTrack = layout.shell?.querySelector<HTMLElement>(
      '[data-persona-dock-role="push-track"]',
    );

    // Desktop, expanded: track carries a negative margin offset.
    withInnerWidth(800, () => {
      layout.syncWidgetState({ open: true, launcherEnabled: true });
    });
    expect(pushTrack?.style.marginLeft).toBe("-320px");

    // Same layout falls into mobile fullscreen (viewport resize): the stale
    // margin must be cleared or the width:100% track renders 320px off-screen.
    withInnerWidth(500, () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(layout.shell?.dataset.personaDockMobileFullscreen).toBe("true");
    expect(pushTrack?.style.marginLeft).toBe("0px");

    layout.destroy();
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
      expect(dockSlot?.style.position).toBe("sticky");
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
      expect(dockSlot?.style.position).toBe("sticky");

      layout.destroy();
    });
  });

  describe("detached docked", () => {
    it("leaves the dock slot flush when detachedPanel is unset", () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          dock: { width: "320px" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      expect(dockSlot?.style.padding).toBe("");
      expect(dockSlot?.style.background).toBe("");

      layout.destroy();
    });

    it("pads the dock slot with the default inset and canvas when detached", () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          detachedPanel: true,
          dock: { width: "320px" },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      expect(dockSlot?.style.padding).toBe("16px");
      expect(dockSlot?.style.background).toBe("transparent");
      expect(dockSlot?.style.boxSizing).toBe("border-box");

      layout.destroy();
    });

    it("resolves detached inset and canvas from panel theme tokens", () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          detachedPanel: true,
          dock: { width: "320px" },
        },
        theme: {
          components: { panel: { inset: "24px", canvasBackground: "#eee" } },
        },
      });

      const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
      expect(dockSlot?.style.padding).toBe("24px");
      expect(dockSlot?.style.background).toBe("rgb(238, 238, 238)");

      layout.destroy();
    });

    it("shrinks the emerge host by the inset so it fits the padded slot", () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          detachedPanel: true,
          dock: { width: "320px", reveal: "emerge" },
        },
      });

      const host = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="host"]');
      // jsdom simplifies the calc expression (320px - 2 * 16px).
      expect(host?.style.width).toBe("calc(288px)");

      layout.destroy();
    });

    it("resolves a percentage emerge width to px before subtracting the inset", () => {
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const target = document.createElement("div");
      parent.appendChild(target);

      const layout = createWidgetHostLayout(target, {
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          detachedPanel: true,
          dock: { width: "50%", reveal: "emerge" },
        },
      });
      const shell = layout.shell!;
      Object.defineProperty(shell, "clientWidth", { get: () => 800, configurable: true });
      layout.updateConfig({
        launcher: {
          mountMode: "docked",
          autoExpand: true,
          detachedPanel: true,
          dock: { width: "50%", reveal: "emerge" },
        },
      });

      const host = shell.querySelector<HTMLElement>('[data-persona-dock-role="host"]');
      // 50% of 800px resolved to px, then jsdom simplifies (400px - 2 * 16px).
      expect(host?.style.width).toBe("calc(368px)");

      layout.destroy();
    });

    it("clears detached chrome and pads nothing while the panel is collapsed", () => {
      for (const reveal of ["resize", "emerge"] as const) {
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const target = document.createElement("div");
        parent.appendChild(target);

        const layout = createWidgetHostLayout(target, {
          launcher: {
            mountMode: "docked",
            autoExpand: false,
            detachedPanel: true,
            dock: { width: "320px", reveal },
          },
        });

        const dockSlot = layout.shell?.querySelector<HTMLElement>('[data-persona-dock-role="panel"]');
        // Collapsed: truly 0-width slot with no padding/background/box-sizing residue.
        expect(dockSlot?.style.width, reveal).toBe("0px");
        expect(dockSlot?.style.padding, reveal).toBe("");
        expect(dockSlot?.style.background, reveal).toBe("");
        expect(dockSlot?.style.boxSizing, reveal).toBe("");
        // Padding rides the width transition so the canvas gutter shrinks with the column.
        expect(dockSlot?.style.transition, reveal).toContain("padding");

        // Opening restores the chrome; closing clears it again.
        layout.syncWidgetState({ open: true, launcherEnabled: true });
        expect(dockSlot?.style.padding, reveal).toBe("16px");
        expect(dockSlot?.style.boxSizing, reveal).toBe("border-box");
        layout.syncWidgetState({ open: false, launcherEnabled: true });
        expect(dockSlot?.style.padding, reveal).toBe("");
        expect(dockSlot?.style.boxSizing, reveal).toBe("");

        layout.destroy();
        document.body.innerHTML = "";
      }
    });
  });
});
