// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { showHistoryConfirm } from "./components/history-confirm-dialog";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { AgentWidgetConfig } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};
const columnOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-rail-conversation");
const triggerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-rail-trigger]")!;

const setup = (side: "left" | "right", composer: AgentWidgetConfig["composer"], composerBar = false) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "/test", persistState: false, suggestionChips: [],
    launcher: composerBar ? { mountMode: "composer-bar" } : { enabled: false },
    composer,
    features: { history: {
      enabled: true, presentation: "rail",
      rail: { side, defaultCollapsed: true, collapsedBehavior: "overlay", resizable: true },
    } },
  });
  controllers.push(controller);
  if (composerBar) controller.open();
  const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
  let width = 900;
  Object.defineProperty(container, "clientWidth", { configurable: true, get: () => width });
  controller.update({});
  return {
    mount, controller, container,
    body: mount.querySelector<HTMLElement>("#persona-scroll-container")!,
    footer: mount.querySelector<HTMLElement>(".persona-widget-footer")!,
    jump: mount.querySelector<HTMLElement>("[data-persona-scroll-to-bottom]")!,
    setWidth: (next: number) => { width = next; controller.update({}); },
  };
};
const pin = async (mount: HTMLElement) => {
  triggerOf(mount).click();
  await flush();
};
const close = async (controller: ReturnType<typeof createAgentExperience>, mount: HTMLElement) => {
  controller.hideHistory();
  await vi.waitFor(() => expect(columnOf(mount)).toBeNull());
};

beforeEach(() => {
  window.scrollTo = vi.fn();
  setHistoryProviderFactory(() => createDemoHistoryProvider({ conversations: [] }));
  setHistoryViewLoader(async () => ({ createHistoryView, showHistoryConfirm }));
});
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.destroy());
  setHistoryProviderFactory(null);
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("history rail scroll-to-bottom placement", () => {
  it.each([
    ["left", "block"], ["right", "block"],
    ["left", "overlay"], ["right", "overlay"],
  ] as const)("follows the conversation through %s rail pin, resize, close and reopen with %s composer", async (side, placement) => {
    const { mount, controller, container, body, jump } = setup(side, { placement });
    expect(jump.parentElement).toBe(container);
    await pin(mount);
    const column = columnOf(mount)!;
    expect(column).not.toBeNull();
    expect(jump.parentElement).toBe(column);
    expect(jump.parentElement).toBe(body.parentElement);

    // Scroll and render syncs used to move it back to the full-width container.
    body.dispatchEvent(new Event("scroll"));
    controller.injectTestMessage({ type: "message", message: {
      id: "reply", role: "assistant", content: "A reply", createdAt: "2026-10-20T00:00:00Z",
    } });
    const handle = mount.querySelector<HTMLElement>(".persona-rail-resizer")!;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    controller.update({ features: { history: { rail: { side: side === "left" ? "right" : "left" } } } });
    expect(jump.parentElement).toBe(column);
    expect(jump.style.left).toBe(""); // Centering remains the shared control CSS.

    controller.update({ features: { scrollToBottom: { enabled: false } } });
    expect(jump.isConnected).toBe(false);
    controller.update({ features: { scrollToBottom: { enabled: true } } });
    expect(jump.parentElement).toBe(column);

    await close(controller, mount);
    expect(jump.parentElement).toBe(container);
    await pin(mount);
    expect(jump.parentElement).toBe(columnOf(mount));
    await close(controller, mount);
    expect(jump.parentElement).toBe(container);
  });

  it("keeps the full-width anchor under a floating rail and restores it after a panel transition", async () => {
    const { mount, controller, container, jump, setWidth } = setup("left", { placement: "overlay" });
    triggerOf(mount).dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    expect(mount.querySelector(".persona-history-rail-overlay")).not.toBeNull();
    expect(jump.parentElement).toBe(container);
    await pin(mount);
    expect(jump.parentElement).toBe(columnOf(mount));
    setWidth(600);
    expect(columnOf(mount)).toBeNull();
    expect(jump.isConnected).toBe(false); // The full history panel covers the transcript.
    setWidth(900);
    expect(jump.parentElement).toBe(columnOf(mount));
    await close(controller, mount);
    expect(jump.parentElement).toBe(container);
  });

  it.each(["block", "overlay"] as const)("preserves %s composer clearance with a docked column", async placement => {
    const { mount, controller, container, footer, jump } = setup("left", { placement });
    await pin(mount);
    const column = columnOf(mount)!;
    const form = footer.querySelector<HTMLElement>("[data-persona-composer-form]")!;
    let height = 120;
    Object.defineProperties(footer, {
      offsetHeight: { configurable: true, get: () => height },
      offsetTop: { configurable: true, value: 400 },
      offsetParent: { configurable: true, get: () => footer.parentElement },
    });
    // Overlay children may skip the static footer in their offsetParent chain.
    Object.defineProperties(form, {
      offsetHeight: { configurable: true, get: () => height - 44 },
      offsetTop: { configurable: true, value: 428 },
      offsetParent: { configurable: true, get: () => footer.parentElement },
    });
    Object.defineProperties(column, {
      offsetTop: { configurable: true, value: 60 },
      offsetParent: { configurable: true, value: container },
    });
    controller.update({});
    expect(jump.style.bottom).toBe(placement === "overlay" ? "108px" : "136px");
    height = 200;
    controller.update({});
    expect(jump.style.bottom).toBe(placement === "overlay" ? "188px" : "216px");
    await close(controller, mount);
    expect(jump.style.bottom).toBe(placement === "overlay" ? "188px" : "216px");
    expect(jump.parentElement).toBe(container);
  });

  it("uses the docked column's lower edge for external composer-bar overlap", async () => {
    const { mount, controller, container, footer, jump } = setup("right", undefined, true);
    await pin(mount);
    const column = columnOf(mount)!;
    expect(jump.parentElement).toBe(column);
    expect(column.contains(footer)).toBe(false);
    container.getBoundingClientRect = () => new DOMRect(0, 0, 900, 800);
    column.getBoundingClientRect = () => new DOMRect(0, 0, 620, 740);
    footer.getBoundingClientRect = () => new DOMRect(0, 700, 900, 100);
    Object.defineProperty(footer, "offsetHeight", { configurable: true, value: 100 });
    controller.update({});
    expect(jump.style.bottom).toBe("56px");
    await close(controller, mount);
    expect(jump.parentElement).toBe(container);
    expect(jump.style.bottom).toBe("116px");
  });
});
