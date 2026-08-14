// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentExperience,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { setHistoryProviderFactory } from "@runtypelabs/persona/internal/history-provider-registry";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";

import { createHomeScreenPlugin } from "./home-screen-plugin";

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Past the Messages exit animation (160ms) and its 250ms teardown ceiling. */
const settleExit = () => new Promise((resolve) => setTimeout(resolve, 300));

describe("home screen on a live widget", () => {
  it("hides the composer on home and swaps the real one in on start", async () => {
    const plugin = createHomeScreenPlugin({
      starters: [{ id: "order", label: "Track my latest order" }],
    });
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://example.com/api",
      persistState: false,
      launcher: { enabled: false },
      plugins: [plugin],
      welcome: { title: "Hi, how can we help?", subtitle: "Ask us anything." },
    });
    await flushMicrotasks();

    // Home is up: hidden placeholder footer, no real composer in the DOM.
    expect(mount.querySelector(".persona-home")).not.toBeNull();
    expect(
      mount.querySelector("[data-persona-home-composer-hidden]"),
    ).not.toBeNull();
    expect(mount.querySelector("[data-persona-composer-input]")).toBeNull();

    mount.querySelector<HTMLButtonElement>(".persona-home__start")!.click();
    await flushMicrotasks();

    // Transcript view: default composer rebuilt in place of the placeholder.
    expect(mount.querySelector(".persona-home")).toBeNull();
    expect(
      mount.querySelector("[data-persona-composer-input]"),
    ).not.toBeNull();
    expect(mount.querySelector("[data-persona-home-composer-hidden]")).toBeNull();

    // The header action path returns home over the transcript: hidden again.
    plugin.showHome();
    await flushMicrotasks();
    expect(mount.querySelector(".persona-home")).not.toBeNull();
    expect(mount.querySelector("[data-persona-composer-input]")).toBeNull();

    controller.destroy();
    mount.remove();
  });
});

/**
 * Home, Messages, and Conversation are three surfaces over one panel body, and
 * the Messages panel closes behind an exit animation. Every interleaving has to
 * land on exactly one surface: the transcript is never visible next to the home
 * stack, and the composer belongs to the conversation alone.
 */
describe("home screen surface switching", () => {
  const mounts: HTMLElement[] = [];
  const controllers: AgentWidgetController[] = [];

  /**
   * jsdom ships no WAAPI, so the Messages exit would resolve synchronously and
   * every close would land before the next click. Timer-backed animations put
   * the ~160ms exit window back.
   */
  const installAnimateStub = () => {
    const original = (Element.prototype as { animate?: unknown }).animate;
    (Element.prototype as unknown as { animate: unknown }).animate = (
      _keyframes: unknown,
      options: unknown,
    ) => {
      const duration =
        typeof options === "number"
          ? options
          : ((options as { duration?: number } | undefined)?.duration ?? 0);
      let settle!: () => void;
      const finished = new Promise<void>((resolve) => {
        settle = resolve;
      });
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        settle();
      };
      const timer = setTimeout(done, duration);
      return {
        finished,
        playState: "running",
        cancel: () => {
          clearTimeout(timer);
          done();
        },
        finish: () => {
          clearTimeout(timer);
          done();
        },
        pause: () => {},
        play: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as Animation;
    };
    return () => {
      (Element.prototype as unknown as { animate: unknown }).animate = original;
    };
  };

  const surfaceOf = (mount: HTMLElement) => {
    const host = mount.querySelector<HTMLElement>("[data-persona-welcome]")!;
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    const hiddenFooter = mount.querySelector<HTMLElement>(
      "[data-persona-home-composer-hidden]",
    );
    return {
      host,
      body,
      hiddenFooter,
      home: !!mount.querySelector(".persona-home"),
      messages: !!mount.querySelector(".persona-history-view"),
      composer: !!mount.querySelector("[data-persona-composer-input]"),
    };
  };

  /** Holds at every step of every sequence, mid-animation included. */
  const expectOneSurface = (mount: HTMLElement, label: string) => {
    const s = surfaceOf(mount);
    const at = ` (${label})`;
    if (s.home) {
      // Plugin content overlays the transcript: the host has to be the overlay
      // and the body has to carry the state class the overlay styles key on.
      expect(s.host.hasAttribute("data-persona-welcome-overlay"), at).toBe(true);
      expect(
        s.host.getAttribute("data-persona-welcome-content"),
        at,
      ).toBe("plugin");
      expect(
        s.body.classList.contains("persona-welcome-overlay-active"),
        at,
      ).toBe(true);
      // Home has no composer, and the placeholder that stands in for it keeps
      // its own inline hide through every chrome pass.
      expect(s.composer, at).toBe(false);
      expect(s.hiddenFooter, at).not.toBeNull();
      expect(s.hiddenFooter!.style.display, at).toBe("none");
    } else {
      expect(
        s.body.classList.contains("persona-welcome-overlay-active"),
        at,
      ).toBe(false);
      expect(s.host.hasAttribute("data-persona-welcome-overlay"), at).toBe(false);
      expect(s.hiddenFooter, at).toBeNull();
      // Messages covers the whole body; only the conversation gets a composer.
      if (!s.messages) {
        expect(s.composer, at).toBe(true);
        expect(s.body.style.display, at).not.toBe("none");
        expect(s.body.hasAttribute("inert"), at).toBe(false);
      }
    }
  };

  const setup = () => {
    const provider = createDemoHistoryProvider({
      conversations: [
        {
          id: "conv-a",
          title: "Order status",
          targetId: null,
          messages: [
            { id: "a1", role: "user", content: "where is my order" },
            { id: "a2", role: "assistant", content: "it ships tomorrow" },
          ],
        },
      ],
    });
    setHistoryProviderFactory(() => provider);
    const plugin = createHomeScreenPlugin({
      starters: [{ id: "order", label: "Track my latest order" }],
      recentStatus: "ready",
      recentConversations: [],
    });
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    mounts.push(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://example.com/api",
      persistState: false,
      launcher: { enabled: false },
      plugins: [plugin],
      features: { history: { enabled: true, presentation: "panel" } },
      welcome: { title: "Hi, how can we help?", subtitle: "Ask us anything." },
    });
    controllers.push(controller);

    // The demo's wiring, verbatim: a committed open or start lands on the
    // conversation, a plain close returns to the surface Messages was opened
    // from.
    let committedWhileOpen = false;
    controller.on("history:opened", () => {
      committedWhileOpen = false;
    });
    const commit = () => {
      committedWhileOpen = true;
      plugin.showConversation();
    };
    controller.on("history:conversationOpened", commit);
    controller.on("history:conversationStarted", commit);
    controller.on("history:closed", (payload: { returnSurface: string }) => {
      const committed = committedWhileOpen;
      committedWhileOpen = false;
      if (committed || payload.returnSurface !== "home") return;
      plugin.showHome();
    });
    return { mount, controller, plugin };
  };

  let restoreAnimate: (() => void) | null = null;

  afterEach(() => {
    restoreAnimate?.();
    restoreAnimate = null;
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

  it("holds one surface across the Messages open/close paths", async () => {
    restoreAnimate = installAnimateStub();
    const { mount, controller, plugin } = setup();
    await flushMicrotasks();
    expectOneSurface(mount, "home");

    // Home -> Messages ("See all", which records home) -> back.
    await controller.showHistory({ returnSurface: "home" });
    await flushMicrotasks();
    expectOneSurface(mount, "messages from home");
    controller.hideHistory();
    await flushMicrotasks();
    expectOneSurface(mount, "home mid-exit");
    await settleExit();
    expectOneSurface(mount, "home after exit");

    // Home -> Messages -> open a conversation: a commit lands on the transcript.
    await controller.showHistory({ returnSurface: "home" });
    await flushMicrotasks();
    await controller.openConversation("conv-a");
    await flushMicrotasks();
    expectOneSurface(mount, "conversation mid-exit");
    await settleExit();
    expectOneSurface(mount, "conversation after exit");

    // Conversation -> Messages (header button, records conversation) -> back.
    await controller.showHistory();
    await flushMicrotasks();
    controller.hideHistory();
    await settleExit();
    expectOneSurface(mount, "conversation returned");

    // Conversation -> back to home over the transcript.
    plugin.showHome();
    await flushMicrotasks();
    expectOneSurface(mount, "home over transcript");
  });

  it("holds one surface when a switch lands inside the Messages exit window", async () => {
    restoreAnimate = installAnimateStub();
    const { mount, controller, plugin } = setup();
    await flushMicrotasks();
    plugin.showConversation();
    await flushMicrotasks();

    // Back to home while the panel is still animating out.
    await controller.showHistory();
    await flushMicrotasks();
    controller.hideHistory();
    plugin.showHome();
    await flushMicrotasks();
    expectOneSurface(mount, "home inside exit window");
    await settleExit();
    expectOneSurface(mount, "home after exit settles");

    // Reopen inside the exit window: the outgoing teardown settles first.
    controller.hideHistory();
    await controller.showHistory({ returnSurface: "home" });
    await flushMicrotasks();
    expectOneSurface(mount, "reopened inside exit window");
    controller.hideHistory();
    await settleExit();
    expectOneSurface(mount, "closed back to home");
  });
});
