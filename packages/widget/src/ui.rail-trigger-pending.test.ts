// @vitest-environment jsdom

/**
 * Overlay-rail trigger during a DOCKING open (`showHistory()` on load): the
 * trigger must not paint while the history chunk loads, or the glyph flashes
 * at the header's leading edge and then jumps to the mounted rail's toggle.
 * Own file because `loadHistoryView` memoizes the resolved module for the
 * lifetime of the module graph: a successful load anywhere else in a file
 * would mask the failure path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

describe("rail trigger during a docking open", () => {
  let controller: ReturnType<typeof createAgentExperience> | null = null;
  let mount: HTMLElement | null = null;

  const setup = () => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      persistState: false,
      features: {
        history: {
          enabled: true,
          presentation: "rail",
          rail: { collapsedBehavior: "overlay" },
        },
      },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      get: () => 900,
    });
    // jsdom reports no width at construction, so the width-derived chrome only
    // resolves on the next sync.
    controller.update({});
    return { mount, controller };
  };

  const triggerWrapper = () =>
    mount!.querySelector<HTMLButtonElement>("[data-persona-rail-trigger]")!
      .parentElement!;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryProviderFactory(() => createDemoHistoryProvider());
  });

  afterEach(() => {
    setHistoryProviderFactory(null);
    controller?.destroy();
    controller = null;
    mount?.remove();
    mount = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("restores the trigger and the borrowed column when the chunk fails to load", async () => {
    setHistoryViewLoader(async () => {
      throw new Error("chunk rejected");
    });
    const { controller: ctl } = setup();
    expect(triggerWrapper().style.display).toBe("");

    const open = ctl.showHistory();
    expect(triggerWrapper().style.display).toBe("none");
    expect(mount!.querySelector(".persona-history-rail-shell")).not.toBeNull();

    await open;
    await flush();
    expect(mount!.querySelector(".persona-history-view")).toBeNull();
    expect(mount!.querySelector(".persona-history-rail-shell")).toBeNull();
    // The header is handed back to the container, not orphaned in the column.
    const header = mount!.querySelector<HTMLElement>(
      '[data-persona-theme-zone="header"]'
    )!;
    expect(
      header.parentElement!.classList.contains("persona-widget-container")
    ).toBe(true);
    expect(triggerWrapper().style.display).toBe("");
  });

  it("reserves the docked geometry from the moment the open starts", async () => {
    let release: () => void = () => {};
    setHistoryViewLoader(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ createHistoryView });
        })
    );
    const { controller: ctl } = setup();
    expect(triggerWrapper().style.display).toBe("");

    const open = ctl.showHistory();
    // Synchronously, before the first frame the chunk load spans: trigger
    // hidden, the column held at the rail's width, and the conversation
    // header already inside the docked layout rather than spanning the
    // widget edge-to-edge.
    expect(triggerWrapper().style.display).toBe("none");
    const shell = mount!.querySelector<HTMLElement>(
      ".persona-history-rail-shell"
    )!;
    expect(shell).not.toBeNull();
    const placeholder = shell.querySelector<HTMLElement>(
      ".persona-history-rail-placeholder"
    )!;
    expect(placeholder).not.toBeNull();
    const host = shell.querySelector<HTMLElement>(".persona-history-rail-host")!;
    expect(host.style.flex).toBe("0 0 260px");
    const header = mount!.querySelector<HTMLElement>(
      '[data-persona-theme-zone="header"]'
    )!;
    expect(
      shell
        .querySelector(".persona-history-rail-conversation")!
        .contains(header)
    ).toBe(true);

    release();
    await open;
    await flush();
    // The view takes the placeholder's slot in the SAME shell: no teardown,
    // no second reflow.
    expect(mount!.querySelector(".persona-history-rail-shell")).toBe(shell);
    expect(shell.querySelector(".persona-history-rail-placeholder")).toBeNull();
    expect(host.contains(mount!.querySelector(".persona-history-view"))).toBe(
      true
    );
    expect(triggerWrapper().style.display).toBe("none");
  });
});
