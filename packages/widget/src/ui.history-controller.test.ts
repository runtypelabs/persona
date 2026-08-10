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
      expect(names).toEqual([
        "opened",
        "conversationOpened",
        "closed",
        "conversationDeleted",
        "cleared",
      ]);
      expect(events[0]![1]).toEqual({
        presentation: "panel",
        returnSurface: "conversation",
        timestamp: expect.any(Number),
      });
      expect(events[1]![1]).toEqual({
        conversationId: "conv-a",
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
