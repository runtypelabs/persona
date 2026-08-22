// @vitest-environment jsdom

/**
 * Drag-resize of the docked Messages rail
 * (`features.history.rail.resizable`): where the handle exists, what a drag
 * and the keyboard do to the width, and how the remembered width is resolved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
} from "./internal/demo-history-provider";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [{ id: "a1", role: "user", content: "where is my order" }],
  },
];

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const setup = (
  options: { rail?: Record<string, unknown>; config?: Record<string, unknown> } = {}
) => {
  setHistoryProviderFactory(() => createDemoHistoryProvider({ conversations: SEEDS }));
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: { keyPrefix: "persona-test-" },
    suggestionChips: [],
    features: {
      history: {
        enabled: true,
        presentation: "rail",
        rail: { resizable: true, ...options.rail },
      },
    },
    ...options.config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
  Object.defineProperty(container, "clientWidth", { configurable: true, get: () => 900 });
  controller.update({});
  return { mount, controller };
};

const handleOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-rail-resizer");
const hostOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-rail-host")!;
const overlayOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-rail-overlay");
const historyButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]")!;
const railToggle = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>('[data-persona-history-focus="collapse"]')!;
const trigger = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-rail-trigger]")!;

/** Opens Messages the way a pointer does. */
const openRail = async (mount: HTMLElement) => {
  historyButton(mount).dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
  );
  await flush();
};

const press = (element: HTMLElement, key: string) =>
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );

/** A whole drag: press on the handle, travel `dx`, release. */
const drag = (handle: HTMLElement, dx: number, opts?: { hold?: boolean }) => {
  handle.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 0 })
  );
  document.dispatchEvent(new MouseEvent("pointermove", { clientX: dx }));
  if (opts?.hold) return;
  document.dispatchEvent(new MouseEvent("pointerup", { clientX: dx }));
};

describe("rail resize handle", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryViewLoader(async () => ({ createHistoryView }));
  });

  afterEach(() => {
    setHistoryProviderFactory(null);
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("puts a labelled separator on the edge facing the conversation", async () => {
    const { mount } = setup();
    await openRail(mount);
    const handle = handleOf(mount)!;
    expect(handle).not.toBeNull();
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-label")).toBe("Resize conversation list");
    expect(handle.getAttribute("aria-valuemin")).toBe("200");
    expect(handle.getAttribute("aria-valuemax")).toBe("400");
    expect(handle.getAttribute("aria-valuenow")).toBe("260");
    expect(handle.tabIndex).toBe(0);
    // Between the rail and the conversation, on the divider's edge.
    expect(handle.previousElementSibling).toBe(hostOf(mount));
    expect(handle.nextElementSibling!.className).toContain(
      "persona-history-rail-conversation"
    );
  });

  it("mirrors to the other side of the rail when it docks right", async () => {
    const { mount } = setup({ rail: { side: "right" } });
    await openRail(mount);
    const handle = handleOf(mount)!;
    expect(handle.nextElementSibling).toBe(hostOf(mount));
  });

  it("stays out of a rail that was never made resizable", async () => {
    const { mount } = setup({ rail: { resizable: false } });
    await openRail(mount);
    expect(handleOf(mount)).toBeNull();
  });

  it("leaves the collapsed icon column alone and comes back on expand", async () => {
    const { mount } = setup();
    await openRail(mount);
    railToggle(mount).click();
    await flush();
    expect(hostOf(mount).style.flex).toBe("0 0 52px");
    expect(handleOf(mount)).toBeNull();

    railToggle(mount).click();
    await flush();
    expect(handleOf(mount)).not.toBeNull();
    expect(hostOf(mount).style.flex).toBe("0 0 260px");
  });

  it("resizes live on drag and commits the width on release", async () => {
    const { mount } = setup();
    await openRail(mount);
    const host = hostOf(mount);
    const handle = handleOf(mount)!;

    drag(handle, 60, { hold: true });
    expect(host.style.flex).toBe("0 0 320px");
    expect(handle.getAttribute("aria-valuenow")).toBe("320");
    // The collapse transition would trail the pointer for the whole drag.
    expect(host.style.transition).toBe("none");

    document.dispatchEvent(new MouseEvent("pointerup", { clientX: 60 }));
    expect(host.style.transition).toBe("");
    expect(host.style.flex).toBe("0 0 320px");
    expect(window.localStorage.getItem("persona-test-rail-width")).toBe("320");
  });

  it("clamps a drag to the rail's own bounds", async () => {
    const { mount } = setup();
    await openRail(mount);
    drag(handleOf(mount)!, 600);
    expect(hostOf(mount).style.flex).toBe("0 0 400px");
    expect(window.localStorage.getItem("persona-test-rail-width")).toBe("400");

    drag(handleOf(mount)!, -600);
    expect(hostOf(mount).style.flex).toBe("0 0 200px");
    expect(window.localStorage.getItem("persona-test-rail-width")).toBe("200");
  });

  it("takes arrow steps and jumps to the bounds from the keyboard", async () => {
    const { mount } = setup();
    await openRail(mount);
    const handle = handleOf(mount)!;

    press(handle, "ArrowRight");
    expect(hostOf(mount).style.flex).toBe("0 0 276px");
    expect(handle.getAttribute("aria-valuenow")).toBe("276");
    press(handle, "ArrowLeft");
    press(handle, "ArrowLeft");
    expect(hostOf(mount).style.flex).toBe("0 0 244px");

    press(handle, "End");
    expect(hostOf(mount).style.flex).toBe("0 0 400px");
    press(handle, "Home");
    expect(hostOf(mount).style.flex).toBe("0 0 200px");
    expect(handle.getAttribute("aria-valuenow")).toBe("200");
    expect(window.localStorage.getItem("persona-test-rail-width")).toBe("200");
  });

  it("inverts the arrows for a rail docked on the right", async () => {
    const { mount } = setup({ rail: { side: "right" } });
    await openRail(mount);
    // The right rail's edge grows leftward, so the arrows track the pixels.
    press(handleOf(mount)!, "ArrowLeft");
    expect(hostOf(mount).style.flex).toBe("0 0 276px");
  });

  it("keeps a chosen width over config and across a reopen", async () => {
    const { mount, controller } = setup({ rail: { width: 300 } });
    await openRail(mount);
    expect(hostOf(mount).style.flex).toBe("0 0 300px");

    drag(handleOf(mount)!, 40);
    expect(hostOf(mount).style.flex).toBe("0 0 340px");

    // A live config update must not undo what the visitor chose.
    controller.update({
      features: { history: { rail: { width: 220 } } },
    } as never);
    await flush();
    expect(hostOf(mount).style.flex).toBe("0 0 340px");

    historyButton(mount).click();
    await flush(20);
    await openRail(mount);
    expect(hostOf(mount).style.flex).toBe("0 0 340px");
  });

  it("hands the remembered width to the floating rail, which has no handle", async () => {
    window.localStorage.setItem("persona-test-rail-width", "340");
    const { mount } = setup({ rail: { collapsedBehavior: "overlay", defaultCollapsed: true } });
    trigger(mount).dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    const overlay = overlayOf(mount)!;
    expect(overlay).not.toBeNull();
    expect(overlay.style.width).toBe("340px");
    expect(handleOf(mount)).toBeNull();

    // Pinned, the same width docks, and the handle comes with it.
    trigger(mount).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    );
    await flush();
    expect(hostOf(mount).style.flex).toBe("0 0 340px");
    expect(handleOf(mount)).not.toBeNull();
  });

  it("stays in memory when state persistence is off", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { mount } = setup({ config: { persistState: false } });
    await openRail(mount);
    drag(handleOf(mount)!, 40);
    expect(hostOf(mount).style.flex).toBe("0 0 300px");
    expect(
      setItem.mock.calls.filter(([key]) => String(key).endsWith("rail-width"))
    ).toEqual([]);

    // The in-memory value still survives a close and reopen.
    historyButton(mount).click();
    await flush(20);
    await openRail(mount);
    expect(hostOf(mount).style.flex).toBe("0 0 300px");
  });
});
