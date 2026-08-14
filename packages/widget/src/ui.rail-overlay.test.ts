// @vitest-environment jsdom

/**
 * Collapsed rail as a floating overlay
 * (`features.history.rail.collapsedBehavior: "overlay"`): the trigger that
 * stands in for the column, hover intent, pinning, and every dismissal.
 *
 * Real timers: the intent and grace delays are the behaviour under test.
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
import { setMacPlatformOverride } from "./utils/shortcuts";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [{ id: "a1", role: "user", content: "where is my order" }],
  },
  {
    id: "conv-b",
    title: "Refund request",
    targetId: null,
    messages: [{ id: "b1", role: "user", content: "i need a refund" }],
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

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Past the 300ms pointer-out grace. */
const GRACE = 380;

const loadHistoryChunk = vi.fn(async () => ({ createHistoryView }));

const setup = (
  options: {
    rail?: Record<string, unknown>;
    config?: Record<string, unknown>;
    width?: number;
  } = {}
) => {
  setHistoryProviderFactory(() => createDemoHistoryProvider({ conversations: SEEDS }));
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    features: {
      history: {
        enabled: true,
        presentation: "rail",
        rail: { collapsedBehavior: "overlay", ...options.rail },
      },
    },
    ...options.config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    get: () => options.width ?? 900,
  });
  // jsdom reports no width at construction, so the width-derived chrome only
  // resolves on the next sync.
  controller.update({});
  return { mount, controller };
};

const trigger = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-rail-trigger]");
const overlayHost = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-rail-overlay");
const railShell = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-rail-shell");
const view = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-view");
const railToggle = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>('[data-persona-history-focus="collapse"]')!;
const historyButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]")!;

/** The themed margin, as the host carries it: a var with its default inline. */
const MARGIN = "var(--persona-history-overlay-margin,8px)";

/** A laid-out rail: the trigger's row, and the rail hanging below it. */
const ROW = { top: 12, bottom: 44, left: 8, right: 40 };
const RAIL = { top: 52, bottom: 500, left: 8, right: 268 };

/** jsdom measures nothing, so both rects are stubbed. Safe to re-run at open. */
const stubRailGeometry = (mount: HTMLElement) => {
  const rect = (box: Partial<DOMRect>) => () => ({ ...box }) as DOMRect;
  mount.querySelector<HTMLElement>(".persona-widget-container")!.getBoundingClientRect =
    rect({ top: 0, left: 0, width: 900 });
  trigger(mount)!.getBoundingClientRect = rect(ROW);
  const host = overlayHost(mount);
  if (host) host.getBoundingClientRect = rect(RAIL);
};

const movePointer = (x: number, y: number) =>
  document.dispatchEvent(
    new MouseEvent("pointermove", { clientX: x, clientY: y })
  );

/** Enter and Space synthesize a click with detail 0; a pointer reports 1. */
const click = (element: HTMLElement, detail: number) =>
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail })
  );

const hover = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent("mouseenter"));
const unhover = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent("mouseleave"));

/** Opens the overlay the way a pointer does, and settles the chunk load. */
const hoverOpen = async (mount: HTMLElement) => {
  hover(trigger(mount)!);
  await flush();
};

describe("collapsed rail overlay", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryViewLoader(loadHistoryChunk);
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
    loadHistoryChunk.mockClear();
  });

  // FIRST in this file on purpose: the chunk loader memoizes per module
  // registry, so only the first mount can observe a cold one.
  it("renders the trigger alone and leaves the chunk unloaded until warmed", async () => {
    const { mount, controller } = setup({ rail: { defaultCollapsed: true } });
    // A restore of the collapsed state must not reach for the view either.
    await controller.showHistory();
    await flush();

    const button = trigger(mount)!;
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Expand conversation list");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(view(mount)).toBeNull();
    expect(railShell(mount)).toBeNull();
    expect(loadHistoryChunk).not.toHaveBeenCalled();

    // Keyboard focus warms it without opening anything.
    button.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(loadHistoryChunk).toHaveBeenCalledTimes(1);
    expect(view(mount)).toBeNull();
  });

  it("takes the leading edge of the conversation header", () => {
    const { mount } = setup();
    const header = mount.querySelector<HTMLElement>('[data-persona-theme-zone="header"]')!;
    expect(header.firstElementChild!.contains(trigger(mount))).toBe(true);
  });

  it("stays the plain sidebar glyph even under a rail brand", async () => {
    const { mount } = setup({
      rail: { brand: { iconUrl: "https://cdn.example/mark.png" } },
    });
    const button = trigger(mount)!;
    // The conversation header beside it already carries the agent's identity.
    expect(button.querySelector("img")).toBeNull();
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Expand conversation list");

    // The brand still dresses the floating rail's own header.
    await hoverOpen(mount);
    expect(
      overlayHost(mount)!.querySelector(".persona-history-brand-mark > img")
    ).not.toBeNull();
  });

  it("mirrors to the trailing edge for a right-docked rail", () => {
    const { mount } = setup({ rail: { side: "right" } });
    const header = mount.querySelector<HTMLElement>('[data-persona-theme-zone="header"]')!;
    expect(header.lastElementChild!.contains(trigger(mount))).toBe(true);
  });

  it("floats the expanded rail as soon as the pointer arrives", async () => {
    const { mount } = setup();
    stubRailGeometry(mount);
    // No dwell: the loaded chunk opens it on the enter itself.
    await hoverOpen(mount);
    const host = overlayHost(mount)!;
    expect(host).not.toBeNull();
    expect(host.contains(view(mount))).toBe(true);
    expect(host.style.width).toBe("260px");
    // Hangs from the trigger's row, one margin off every other edge, and
    // rounded on all four corners.
    expect(host.style.top).toBe(`calc(44px + ${MARGIN})`);
    expect(host.style.bottom).toBe(MARGIN);
    expect(host.style.left).toBe(MARGIN);
    expect(host.style.right).toBe("");
    expect(host.style.borderRadius).toBe("var(--persona-history-overlay-radius,16px)");
    expect(host.style.background).toBe(
      "var(--persona-history-overlay-bg,var(--persona-container,#f7f7f8))"
    );
    expect(host.style.boxShadow).toBe(
      "var(--persona-history-overlay-shadow,0 12px 40px rgba(0,0,0,0.25))"
    );
    // The trigger stays above it, visible and clickable.
    expect(trigger(mount)!.parentElement!.style.display).toBe("");
    // Expanded, not the icon column, and floating rather than docked.
    expect(
      view(mount)!.classList.contains("persona-history-view--rail-collapsed")
    ).toBe(false);
    expect(railShell(mount)).toBeNull();
    expect(trigger(mount)!.getAttribute("aria-expanded")).toBe("true");
    expect(mount.querySelectorAll(".persona-history-row").length).toBeGreaterThan(0);
    // The rail is the answer to the hover; a tooltip would race it.
    expect(document.querySelector(".persona-control-tooltip")).toBeNull();
    // The control still carries its name and its combo for assistive tech.
    expect(trigger(mount)!.getAttribute("aria-label")).toBe(
      "Expand conversation list"
    );
  });

  it("takes a pass of the pointer back off after the grace", async () => {
    const { mount } = setup();
    hover(trigger(mount)!);
    unhover(trigger(mount)!);
    await flush();
    await wait(GRACE);
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
    expect(view(mount)).toBeNull();
  });

  it("holds the rail while the pointer crosses the header above it", async () => {
    const { mount } = setup();
    stubRailGeometry(mount);
    await hoverOpen(mount);
    stubRailGeometry(mount);

    // Leaving the trigger arms the grace; the bridge above the rail, which
    // belongs to neither element, takes it back off.
    unhover(trigger(mount)!);
    movePointer(150, 28);
    await wait(GRACE);
    await flush();
    expect(overlayHost(mount)).not.toBeNull();

    // And inside the rail itself.
    movePointer(150, 200);
    await wait(GRACE);
    await flush();
    expect(overlayHost(mount)).not.toBeNull();
  });

  it("dismisses once the pointer passes the rail's edges", async () => {
    const { mount } = setup();
    stubRailGeometry(mount);
    await hoverOpen(mount);
    stubRailGeometry(mount);

    // Same header row, past the rail's right edge.
    movePointer(RAIL.right + 40, 28);
    await wait(GRACE);
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
    expect(view(mount)).toBeNull();
    expect(trigger(mount)!.getAttribute("aria-expanded")).toBe("false");
  });

  it("dismisses below the rail as well", async () => {
    const { mount } = setup();
    stubRailGeometry(mount);
    await hoverOpen(mount);
    stubRailGeometry(mount);

    movePointer(150, RAIL.bottom + 40);
    await wait(GRACE);
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
  });

  it("tracks the pointer only while the rail floats", async () => {
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const { mount, controller } = setup();
    stubRailGeometry(mount);
    await hoverOpen(mount);
    const listener = added.mock.calls.find(([type]) => type === "pointermove");
    expect(listener).toBeDefined();

    stubRailGeometry(mount);
    movePointer(RAIL.right + 40, RAIL.bottom + 40);
    await wait(GRACE);
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
    const wasRemoved = ([type, fn]: unknown[]) =>
      type === "pointermove" && fn === listener![1];
    expect(removed.mock.calls.some(wasRemoved)).toBe(true);

    removed.mockClear();
    controller.destroy();
    expect(removed.mock.calls.some(wasRemoved)).toBe(true);
  });

  it("pins the same view element into the full-height rail on click", async () => {
    const { mount } = setup({ config: { persistState: { keyPrefix: "persona-test-" } } });
    await hoverOpen(mount);
    const element = view(mount)!;
    element.dataset.mark = "same-view";

    // A real pointer click, on the trigger the floating rail no longer covers.
    click(trigger(mount)!, 1);
    await flush();
    expect(overlayHost(mount)).toBeNull();
    const shell = railShell(mount)!;
    expect(shell).not.toBeNull();
    expect(shell.contains(element)).toBe(true);
    expect(view(mount)!.dataset.mark).toBe("same-view");
    expect(
      mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex
    ).toBe("0 0 260px");
    expect(window.localStorage.getItem("persona-test-rail-collapsed")).toBe("0");
    // The rail's own toggle owns the control now, so the trigger stands down.
    expect(trigger(mount)!.parentElement!.style.display).toBe("none");
  });

  it("pins from the keyboard, even right after a dismissal under the pointer", async () => {
    const { mount } = setup();
    await hoverOpen(mount);
    // Dismiss with the pointer still inside: that arms the hover hold-off.
    view(mount)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush(20);
    expect(overlayHost(mount)).toBeNull();

    // The hold-off gates hover, never a commitment.
    click(trigger(mount)!, 0);
    await flush();
    expect(railShell(mount)).not.toBeNull();
    expect(overlayHost(mount)).toBeNull();
  });

  it("returns to the trigger when the pinned rail collapses", async () => {
    const { mount } = setup({ config: { persistState: { keyPrefix: "persona-test-" } } });
    trigger(mount)!.click();
    await flush();
    expect(railShell(mount)).not.toBeNull();

    railToggle(mount).click();
    await flush(20);
    expect(railShell(mount)).toBeNull();
    expect(view(mount)).toBeNull();
    expect(window.localStorage.getItem("persona-test-rail-collapsed")).toBe("1");
    const button = trigger(mount)!;
    expect(button.parentElement!.style.display).toBe("");
    expect(document.activeElement).toBe(button);
  });

  it("pins from the floating rail's own toggle, which sits where the trigger does", async () => {
    const { mount } = setup();
    await hoverOpen(mount);
    // Floating, that control docks the rail, and says so.
    expect(railToggle(mount).getAttribute("aria-label")).toBe(
      "Expand conversation list"
    );
    expect(railToggle(mount).getAttribute("aria-expanded")).toBe("false");

    railToggle(mount).click();
    await flush();
    expect(overlayHost(mount)).toBeNull();
    expect(railShell(mount)).not.toBeNull();
    expect(railToggle(mount).getAttribute("aria-label")).toBe(
      "Collapse conversation list"
    );
    expect(railToggle(mount).getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles the pin from the collapse shortcut", async () => {
    setMacPlatformOverride(false);
    const { mount } = setup({ rail: { collapseShortcut: "mod+b" } });
    const press = (target: EventTarget) =>
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "b",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    // From rest, with nothing mounted, the combo still pins.
    press(trigger(mount)!);
    await flush();
    expect(railShell(mount)).not.toBeNull();
    press(railToggle(mount));
    await flush(20);
    expect(railShell(mount)).toBeNull();
    expect(trigger(mount)).not.toBeNull();
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const { mount } = setup();
    await hoverOpen(mount);
    view(mount)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
    expect(document.activeElement).toBe(trigger(mount));

    // The trigger the floating rail hangs from is inside its Escape scope.
    await hoverOpen(mount);
    trigger(mount)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
  });

  it("does not let a re-enter undo a dismissal made under the pointer", async () => {
    const { mount } = setup();
    stubRailGeometry(mount);
    await hoverOpen(mount);
    stubRailGeometry(mount);
    // The pointer is resting inside the rail as it is dismissed.
    unhover(trigger(mount)!);
    movePointer(150, 200);
    view(mount)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush(20);
    expect(overlayHost(mount)).toBeNull();

    // The removal re-enters whatever is under the pointer, unmoved.
    hover(trigger(mount)!);
    await flush();
    expect(overlayHost(mount)).toBeNull();

    // A real departure ends the hold-off.
    unhover(trigger(mount)!);
    await hoverOpen(mount);
    expect(overlayHost(mount)).not.toBeNull();
  });

  it("closes on a click outside, but not on one inside", async () => {
    const { mount } = setup();
    await hoverOpen(mount);
    overlayHost(mount)!.dispatchEvent(
      new Event("pointerdown", { bubbles: true })
    );
    await flush();
    expect(overlayHost(mount)).not.toBeNull();

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
  });

  it("closes after a conversation is selected", async () => {
    const { mount } = setup();
    await hoverOpen(mount);
    mount
      .querySelector<HTMLButtonElement>(
        '[data-persona-history-conversation="conv-b"]'
      )!
      .click();
    await flush(30);
    expect(overlayHost(mount)).toBeNull();
    expect(view(mount)).toBeNull();
  });

  it("opens on the first tap and pins on the second under a coarse pointer", async () => {
    // jsdom ships no matchMedia, which is why the fine-pointer tests above
    // exercise the hover path at all.
    window.matchMedia = ((query: string) =>
      ({ matches: query.includes("coarse") }) as MediaQueryList) as typeof window.matchMedia;
    const { mount } = setup();
    // No hover to open with, so the enter is ignored.
    hover(trigger(mount)!);
    await flush();
    expect(overlayHost(mount)).toBeNull();

    click(trigger(mount)!, 1);
    await flush();
    expect(overlayHost(mount)).not.toBeNull();

    click(trigger(mount)!, 1);
    await flush();
    expect(overlayHost(mount)).toBeNull();
    expect(railShell(mount)).not.toBeNull();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("pins and unpins from the header Messages button", async () => {
    const { mount } = setup();
    historyButton(mount).click();
    await flush();
    expect(railShell(mount)).not.toBeNull();
    historyButton(mount).click();
    await flush(20);
    expect(railShell(mount)).toBeNull();
    expect(trigger(mount)).not.toBeNull();
    setMacPlatformOverride(null);
  });

  it("leaves the panel fallback below 720px untouched", async () => {
    const { mount } = setup({ width: 600 });
    expect(trigger(mount)).toBeNull();
    historyButton(mount).click();
    await flush();
    expect(view(mount)).not.toBeNull();
    expect(railShell(mount)).toBeNull();
    expect(overlayHost(mount)).toBeNull();
    expect(
      view(mount)!.getAttribute("data-persona-history-presentation")
    ).toBe("panel");
  });

  it("takes its listeners and timers down with the widget", async () => {
    const { mount, controller } = setup();
    // An open raced by the teardown must not mount behind it.
    hover(trigger(mount)!);
    controller.destroy();
    await flush(20);
    expect(overlayHost(mount)).toBeNull();
    await wait(GRACE);
    await flush();
    expect(overlayHost(mount)).toBeNull();
    // A pointerdown after teardown must not reach a detached handler.
    expect(() =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    ).not.toThrow();
  });
});
