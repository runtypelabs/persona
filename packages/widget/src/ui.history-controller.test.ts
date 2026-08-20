// @vitest-environment jsdom

/**
 * Public history controller surface and events
 * (`docs/visitor-history-implementation-plan.md` D6/D8): method semantics,
 * sanitized/deduped events, window mirrors, init-handle forwarding, and the
 * distinct clearChat / startNewConversation / clearConversationHistory /
 * resetHistoryIdentity semantics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { initAgentWidget } from "./runtime/init";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
  type DemoHistoryProvider,
} from "./internal/demo-history-provider";
import type { HistoryProvider } from "./internal/history-provider";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [
      { id: "a1", role: "user", content: "where is my order" },
      { id: "a2", role: "assistant", content: "it ships tomorrow" },
    ],
  },
  {
    id: "conv-b",
    title: "Refund request",
    targetId: null,
    messages: [{ id: "b1", role: "user", content: "refund please" }],
  },
];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const mounts: HTMLElement[] = [];
const controllers: Array<{ destroy: () => void }> = [];

/** Demo provider plus an injectable `resetDevice`, which it deliberately omits. */
const withResetDevice = (
  provider: DemoHistoryProvider,
  result: () => Promise<{ remoteRevocationConfirmed: boolean }>
): HistoryProvider => ({
  ...provider,
  capabilities: provider.capabilities,
  resetDevice: result,
});

const setup = (
  options: {
    provider?: HistoryProvider;
    config?: Record<string, unknown>;
  } = {}
) => {
  const provider =
    options.provider ?? createDemoHistoryProvider({ conversations: SEEDS });
  setHistoryProviderFactory(() => provider);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    features: { history: { enabled: true } },
    ...options.config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller, provider };
};

describe("history controller API", () => {
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

  describe("methods", () => {
    it("lists conversations for headless hosts", async () => {
      const { controller } = setup();
      const page = await controller.listConversations({ limit: 10 });
      expect(page.items.map((item) => item.id)).toEqual(["conv-b", "conv-a"]);
      expect(page.nextCursor).toBeNull();
    });

    it("opens a conversation and hydrates its transcript", async () => {
      const { mount, controller } = setup();
      await controller.openConversation("conv-a");
      await flush();
      expect(controller.getMessages().map((message) => message.id)).toEqual([
        "a1",
        "a2",
      ]);
      expect(
        mount.querySelectorAll("#persona-scroll-container [data-message-id]").length
      ).toBe(2);
    });

    it("keeps focus off the composer for programmatic opens, and moves it with focus: true", async () => {
      const { mount, controller } = setup();
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      outside.focus();

      // A boot-time reopen must not steal focus: in a same-origin iframe the
      // browser would scroll the host page to the widget.
      await controller.openConversation("conv-a");
      await flush();
      expect(document.activeElement).toBe(outside);

      await controller.startNewConversation();
      await flush();
      expect(document.activeElement).toBe(outside);

      await controller.openConversation("conv-a", { focus: true });
      await flush();
      expect(document.activeElement).toBe(mount.querySelector("textarea"));

      outside.focus();
      await controller.startNewConversation({ focus: true });
      await flush();
      expect(document.activeElement).toBe(mount.querySelector("textarea"));
    });

    it("starts a new server conversation and clears the transcript", async () => {
      const { controller, provider } = setup();
      await controller.openConversation("conv-a");
      await flush();
      await controller.startNewConversation();
      await flush();
      expect(controller.getMessages()).toEqual([]);
      const active = (provider as DemoHistoryProvider).getActiveConversationId();
      expect(active).not.toBe("conv-a");
      expect(active).not.toBeNull();
    });

    it("deletes an inactive conversation without disturbing the active one", async () => {
      const { controller, provider } = setup();
      await controller.openConversation("conv-a");
      await flush();
      await controller.deleteConversation("conv-b");
      await flush();
      expect(controller.getMessages().map((message) => message.id)).toEqual([
        "a1",
        "a2",
      ]);
      expect(
        (provider as DemoHistoryProvider).getConversationIds()
      ).not.toContain("conv-b");
    });

    it("defaults delete-all to the active target and honors an explicit opt-out", async () => {
      const spy = vi.fn().mockResolvedValue({ deleted: 2 });
      const base = createDemoHistoryProvider({ conversations: SEEDS });
      const provider: HistoryProvider = { ...base, deleteAll: spy };
      const { controller } = setup({ provider });

      await controller.clearConversationHistory();
      // No client-token session in this harness, so the active target is null
      // and the filter is simply omitted rather than invented.
      expect(spy.mock.calls[0][0]).toEqual(
        expect.objectContaining({ context: { scope: "browser" } })
      );
      expect(spy.mock.calls[0][0].targetId).toBeUndefined();

      await controller.clearConversationHistory({ targetId: "flow-1" });
      expect(spy.mock.calls[1][0].targetId).toBe("flow-1");

      await controller.clearConversationHistory({
        targetId: "flow-1",
        allTargets: true,
      });
      expect(spy.mock.calls[2][0].targetId).toBeUndefined();
    });

    it("exposes the sanitized identity status synchronously", () => {
      const { controller } = setup();
      expect(controller.getHistoryIdentityStatus()).toEqual({
        state: "browser_only",
        reason: "no_identity_provider",
      });
    });

    it("reports unavailable identity status without a provider", () => {
      setHistoryProviderFactory(null);
      const mount = document.createElement("div");
      document.body.appendChild(mount);
      mounts.push(mount);
      const controller = createAgentExperience(mount, {
        apiUrl: "https://api.example.com/chat",
        launcher: { enabled: false },
        persistState: false,
      } as unknown as Parameters<typeof createAgentExperience>[1]);
      controllers.push(controller);
      expect(controller.getHistoryIdentityStatus()).toEqual({
        state: "unavailable",
        reason: "history_disabled",
      });
    });

    it("shows, reports, and hides the history surface", async () => {
      const { mount, controller } = setup();
      expect(controller.isHistoryVisible()).toBe(false);
      await controller.showHistory();
      await flush();
      expect(controller.isHistoryVisible()).toBe(true);
      expect(mount.querySelector(".persona-history-view")).not.toBeNull();
      controller.hideHistory();
      expect(controller.isHistoryVisible()).toBe(false);
      expect(mount.querySelector(".persona-history-view")).toBeNull();
    });

    it("records a home return surface supplied by a composition", async () => {
      const { controller } = setup();
      const closed: Array<Record<string, unknown>> = [];
      controller.on("history:closed", (payload) =>
        closed.push(payload as unknown as Record<string, unknown>)
      );
      await controller.showHistory({ returnSurface: "home" });
      await flush();
      controller.hideHistory();
      expect(closed[0]!.returnSurface).toBe("home");
    });
  });

  describe("events", () => {
    it("emits sanitized open/close/opened/deleted/cleared payloads", async () => {
      const { controller } = setup();
      const events: Array<[string, Record<string, unknown>]> = [];
      const record = (name: string) => (payload: unknown) =>
        events.push([name, payload as Record<string, unknown>]);
      controller.on("history:opened", record("opened"));
      controller.on("history:closed", record("closed"));
      controller.on("history:conversationOpened", record("conversationOpened"));
      controller.on("history:conversationDeleted", record("conversationDeleted"));
      controller.on("history:cleared", record("cleared"));

      await controller.showHistory();
      await flush();
      await controller.openConversation("conv-a");
      await flush();
      await controller.deleteConversation("conv-a");
      await flush();
      await controller.clearConversationHistory();
      await flush();

      const names = events.map(([name]) => name);
      // Optimistic open: the panel closes on the selection and the
      // conversationOpened commit follows once the transcript hydrates.
      expect(names).toEqual([
        "opened",
        "closed",
        "conversationOpened",
        "conversationDeleted",
        "cleared",
      ]);
      expect(events[0]![1]).toEqual({
        presentation: "panel",
        returnSurface: "conversation",
        timestamp: expect.any(Number),
      });
      expect(events[2]![1]).toEqual({
        conversationId: "conv-a",
        title: "Order status",
        scope: "browser",
        timestamp: expect.any(Number),
      });
      expect(events[3]![1]).toEqual({
        conversationId: "conv-a",
        scope: "browser",
        wasActive: true,
        timestamp: expect.any(Number),
      });
      expect(events[4]![1]).toEqual({
        deleted: expect.any(Number),
        scope: "browser",
        targetId: null,
        timestamp: expect.any(Number),
      });
      // No credential, proof, visitor, or backend text anywhere.
      const serialized = JSON.stringify(events);
      expect(serialized).not.toMatch(/token|proof|visitor|endUser/i);
    });

    it("binds the header title to the active conversation with titleSource", async () => {
      const { controller, mount } = setup({
        config: {
          launcher: { enabled: false, title: "Acme Assistant" },
          layout: { header: { layout: "minimal", titleSource: "conversation" } },
        },
      });
      // Scoped to the header zone: the history list rows also render titles.
      const titleShown = (text: string): boolean =>
        Array.from(
          mount
            .querySelector('[data-persona-theme-zone="header"]')
            ?.querySelectorAll("span") ?? []
        ).some((el) => el.textContent === text);

      await controller.showHistory();
      await flush();
      expect(titleShown("Order status")).toBe(false);

      await controller.openConversation("conv-a");
      await flush();
      expect(titleShown("Order status")).toBe(true);

      // A fresh conversation reverts to the static fallback.
      await controller.startNewConversation();
      await flush();
      expect(titleShown("Order status")).toBe(false);
      expect(titleShown("Acme Assistant")).toBe(true);
    });

    it("renames and stars conversations through the controller", async () => {
      const { controller, mount } = setup({
        config: {
          launcher: { enabled: false, title: "Acme Assistant" },
          layout: { header: { layout: "minimal", titleSource: "conversation" } },
        },
      });
      await controller.showHistory();
      await flush();

      const renamed = await controller.renameConversation(
        "conv-a",
        "Renamed thread"
      );
      expect(renamed.title).toBe("Renamed thread");
      await flush();
      // The open list restamps in place.
      expect(
        mount.querySelector('[data-persona-history-conversation="conv-a"]')
          ?.textContent
      ).toContain("Renamed thread");

      const starred = await controller.setConversationStarred("conv-a", true);
      expect(starred.starred).toBe(true);
      await flush();
      // Starred rows pin into the leading group.
      expect(
        mount.querySelector('[data-persona-history-group="starred"]')
      ).not.toBeNull();

      await controller.openConversation("conv-a");
      await flush();
      // The titleSource binding shows the renamed title in the header.
      const headerSpans = Array.from(
        mount
          .querySelector('[data-persona-theme-zone="header"]')
          ?.querySelectorAll("span") ?? []
      );
      expect(headerSpans.some((el) => el.textContent === "Renamed thread")).toBe(
        true
      );
    });

    it("prunes the open list when a delete comes from the controller", async () => {
      const { controller, mount } = setup();
      await controller.showHistory();
      await flush();
      expect(
        mount.querySelector('[data-persona-history-conversation="conv-b"]')
      ).not.toBeNull();

      await controller.deleteConversation("conv-b");
      await flush();
      expect(
        mount.querySelector('[data-persona-history-conversation="conv-b"]')
      ).toBeNull();
    });

    it("locks the conversation-bound title menu until a conversation is open", async () => {
      const { controller, mount } = setup({
        config: {
          launcher: { enabled: false, title: "Acme Assistant" },
          layout: {
            header: {
              layout: "minimal",
              titleSource: "conversation",
              titleMenu: {
                menuItems: [{ id: "star", label: "Star" }],
                onSelect: () => false,
              },
            },
          },
        },
      });
      await flush();

      const combo = () =>
        mount.querySelector<HTMLElement>(".persona-combo-btn");
      expect(combo()?.getAttribute("data-persona-menu-locked")).toBe("true");
      // Locked, a click opens nothing: the combo reads as a plain title.
      combo()!.click();
      expect(
        mount.querySelector(".persona-dropdown-menu:not(.persona-hidden)")
      ).toBeNull();

      await controller.openConversation("conv-a");
      await flush();
      expect(combo()?.getAttribute("data-persona-menu-locked")).toBe("false");

      // Deleting the active conversation installs a replacement record, so
      // the menu stays available: its actions target the fresh conversation.
      await controller.deleteConversation("conv-a");
      await flush();
      expect(combo()?.getAttribute("data-persona-menu-locked")).toBe("false");
    });

    it("runs the built-in star toggle from the title-menu event", async () => {
      const { controller, mount } = setup();
      await controller.openConversation("conv-a");
      await flush();

      mount
        .querySelector('[data-persona-theme-zone="header"]')!
        .dispatchEvent(
          new CustomEvent("persona:title-menu-builtin", {
            bubbles: true,
            detail: { actionId: "star" },
          })
        );
      await flush();

      const page = await controller.listConversations({ limit: 10 });
      expect(page.items.find((item) => item.id === "conv-a")?.starred).toBe(true);
    });

    it("emits a sanitized conversationStarted from the controller method", async () => {
      const { controller, provider } = setup();
      const started: Array<Record<string, unknown>> = [];
      controller.on("history:conversationStarted", (payload) =>
        started.push(payload as unknown as Record<string, unknown>)
      );

      await controller.openConversation("conv-a");
      await flush();
      await controller.startNewConversation();
      await flush();

      const active = (provider as DemoHistoryProvider).getActiveConversationId();
      expect(started).toEqual([
        { conversationId: active, timestamp: expect.any(Number) },
      ]);
      expect(started[0]!.conversationId).not.toBe("conv-a");
      expect(JSON.stringify(started)).not.toMatch(/token|proof|visitor|endUser/i);
    });

    it("emits conversationStarted from the header new-conversation action", async () => {
      const { mount, controller, provider } = setup();
      const started: Array<Record<string, unknown>> = [];
      controller.on("history:conversationStarted", (payload) =>
        started.push(payload as unknown as Record<string, unknown>)
      );

      // With history available the clear-chat affordance IS "New conversation".
      const headerAction = mount.querySelector<HTMLButtonElement>(
        ".persona-clear-chat-button-wrapper button"
      )!;
      expect(headerAction.getAttribute("aria-label")).toBe("New conversation");
      headerAction.click();
      await flush(20);

      expect(started.length).toBe(1);
      expect(started[0]!.conversationId).toBe(
        (provider as DemoHistoryProvider).getActiveConversationId()
      );
    });

    it("emits conversationStarted before history:closed for the in-panel action", async () => {
      const { mount, controller } = setup();
      const order: string[] = [];
      controller.on("history:conversationStarted", () => order.push("started"));
      controller.on("history:closed", () => order.push("closed"));

      await controller.showHistory();
      await flush();
      mount.querySelector<HTMLButtonElement>("button.persona-history-new")!.click();
      await flush(20);

      // The commit is distinguishable from a plain close: it precedes it.
      expect(order).toEqual(["started", "closed"]);
      expect(controller.isHistoryVisible()).toBe(false);
    });

    it("dedupes identity status changes and carries a timestamp", async () => {
      const provider = createDemoHistoryProvider({ conversations: SEEDS });
      const { controller } = setup({ provider });
      const seen: Array<Record<string, unknown>> = [];
      controller.on("history:identityStatusChanged", (payload) =>
        seen.push(payload as unknown as Record<string, unknown>)
      );

      provider.setIdentityStatus({ state: "verifying" });
      provider.setIdentityStatus({ state: "verifying" });
      provider.setIdentityStatus({ state: "verified" });
      provider.setIdentityStatus({ state: "verified" });

      expect(seen).toEqual([
        { status: { state: "verifying" }, timestamp: expect.any(Number) },
        { status: { state: "verified" }, timestamp: expect.any(Number) },
      ]);
    });

    it("mirrors show/hide through window events but never identity status", async () => {
      const { mount, controller } = setup();
      window.dispatchEvent(new CustomEvent("persona:showHistory"));
      await flush();
      expect(controller.isHistoryVisible()).toBe(true);
      expect(mount.querySelector(".persona-history-view")).not.toBeNull();

      window.dispatchEvent(new CustomEvent("persona:hideHistory"));
      await flush();
      expect(controller.isHistoryVisible()).toBe(false);

      // Identity state stays on the instance bus; there is no window mirror.
      const identityListener = vi.fn();
      window.addEventListener("persona:historyIdentityStatus", identityListener);
      (
        (controller as unknown as { getHistoryIdentityStatus: () => unknown })
      ).getHistoryIdentityStatus();
      expect(identityListener).not.toHaveBeenCalled();
      window.removeEventListener("persona:historyIdentityStatus", identityListener);
    });

    it("forwards every history method through the init handle proxy", async () => {
      const provider = createDemoHistoryProvider({ conversations: SEEDS });
      setHistoryProviderFactory(() => provider);
      const host = document.createElement("div");
      host.id = "history-proxy-host";
      document.body.appendChild(host);
      mounts.push(host);
      const handle = initAgentWidget({
        target: "#history-proxy-host",
        config: {
          apiUrl: "https://api.example.com/chat",
          launcher: { enabled: false },
          persistState: false,
          features: { history: { enabled: true } },
        },
      });
      controllers.push(handle);

      for (const method of [
        "listConversations",
        "openConversation",
        "startNewConversation",
        "deleteConversation",
        "clearConversationHistory",
        "resetHistoryIdentity",
        "getHistoryIdentityStatus",
        "showHistory",
        "hideHistory",
        "isHistoryVisible",
      ] as const) {
        expect(typeof handle[method]).toBe("function");
      }
      const page = await handle.listConversations();
      expect(page.items.length).toBe(2);
      await handle.showHistory();
      await flush();
      expect(handle.isHistoryVisible()).toBe(true);
    });
  });

  describe("resetHistoryIdentity", () => {
    const resetSetup = (
      remote: () => Promise<{ remoteRevocationConfirmed: boolean }>
    ) => {
      const base = createDemoHistoryProvider({ conversations: SEEDS });
      return setup({ provider: withResetDevice(base, remote) });
    };

    it("wipes local state, closes history, and reports confirmation", async () => {
      const { mount, controller } = resetSetup(async () => ({
        remoteRevocationConfirmed: true,
      }));
      await controller.openConversation("conv-a");
      await flush();
      controller.updatePersistentMetadata(() => ({ sessionId: "sess-1" }));
      await controller.showHistory();
      await flush();

      const result = await controller.resetHistoryIdentity();
      await flush();

      expect(result).toEqual({ remoteRevocationConfirmed: true });
      expect(controller.getMessages()).toEqual([]);
      expect(controller.getArtifacts()).toEqual([]);
      expect(controller.getPersistentMetadata()).toEqual({});
      expect(controller.isHistoryVisible()).toBe(false);
      expect(mount.querySelector(".persona-history-view")).toBeNull();
      expect(
        mount.querySelectorAll("#persona-scroll-container [data-message-id]").length
      ).toBe(0);
    });

    it("resolves false after a failed remote revocation and still wipes", async () => {
      const { controller } = resetSetup(async () => ({
        remoteRevocationConfirmed: false,
      }));
      const events: Array<Record<string, unknown>> = [];
      controller.on("history:identityReset", (payload) =>
        events.push(payload as unknown as Record<string, unknown>)
      );
      await controller.openConversation("conv-a");
      await flush();

      await expect(controller.resetHistoryIdentity()).resolves.toEqual({
        remoteRevocationConfirmed: false,
      });
      expect(controller.getMessages()).toEqual([]);
      expect(events).toEqual([
        { remoteRevocationConfirmed: false, timestamp: expect.any(Number) },
      ]);
      const live = document.querySelector<HTMLElement>("[data-persona-live-region]");
      expect(live!.textContent).toContain("could not confirm");
    });

    it("still wipes when a misbehaving provider reset rejects", async () => {
      const { controller } = resetSetup(async () => {
        throw new Error("network down");
      });
      await controller.openConversation("conv-a");
      await flush();
      await expect(controller.resetHistoryIdentity()).rejects.toThrow("network down");
      // The privacy-critical local wipe is unconditional.
      expect(controller.getMessages()).toEqual([]);
    });

    it("rejects as misuse when the provider cannot reset the device", async () => {
      const { controller } = setup();
      await expect(controller.resetHistoryIdentity()).rejects.toThrow(
        /resetHistoryIdentity/
      );
    });
  });

  describe("distinct clear semantics", () => {
    it("clearChat only clears the local view and never starts a server conversation", async () => {
      const { controller, provider } = setup();
      await controller.openConversation("conv-a");
      await flush();
      const before = (provider as DemoHistoryProvider).getConversationIds();

      controller.clearChat();
      await flush();

      expect(controller.getMessages()).toEqual([]);
      expect((provider as DemoHistoryProvider).getConversationIds()).toEqual(before);
      expect((provider as DemoHistoryProvider).getActiveConversationId()).toBe(
        "conv-a"
      );
    });

    it("startNewConversation creates a server record and leaves prior records intact", async () => {
      const { controller, provider } = setup();
      const before = (provider as DemoHistoryProvider).getConversationIds();
      await controller.startNewConversation();
      await flush();
      const after = (provider as DemoHistoryProvider).getConversationIds();
      expect(after.length).toBe(before.length + 1);
      expect(after).toEqual(expect.arrayContaining(before));
    });

    it("clearConversationHistory deletes the server records and starts fresh", async () => {
      const { controller, provider } = setup();
      await controller.openConversation("conv-a");
      await flush();
      const result = await controller.clearConversationHistory();
      await flush();
      expect(result.deleted).toBe(2);
      expect(controller.getMessages()).toEqual([]);
      // A replacement conversation was prepared, so sending stays possible.
      expect(
        (provider as DemoHistoryProvider).getActiveConversationId()
      ).not.toBeNull();
    });
  });
});
