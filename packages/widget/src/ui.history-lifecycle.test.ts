// @vitest-environment jsdom

/**
 * Controller-level history lifecycle (`docs/visitor-history-implementation-plan.md`
 * D4/D6): the `update()` visitor-store re-key matrix, `destroy()` releasing the
 * storage listener and any held first-init lease, and provider rebuilds
 * rebinding their subscriptions without leaving a stale one attached.
 *
 * The store itself is covered by `utils/visitor-store.test.ts`; everything here
 * is about who owns it and when the controller swaps it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Records every store the controller builds, with its construction tuple. */
const recorder = vi.hoisted(() => ({
  instances: [] as Array<{
    args: [string, string, boolean];
    store: import("./utils/visitor-store").VisitorStore;
    destroy: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("./utils/visitor-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./utils/visitor-store")>();
  return {
    ...actual,
    createVisitorStore: (
      clientToken: string,
      keyPrefix: string,
      persistDisabled: boolean
    ) => {
      const store = actual.createVisitorStore(
        clientToken,
        keyPrefix,
        persistDisabled
      );
      const destroy = vi.fn(() => store.destroy());
      const clear = vi.fn(() => store.clear());
      recorder.instances.push({
        args: [clientToken, keyPrefix, persistDisabled],
        store,
        destroy,
        clear,
      });
      return { ...store, destroy, clear };
    },
  };
});

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import { visitorStoreKeys } from "./utils/visitor-store";
import type { HistoryProvider } from "./internal/history-provider";
import type { HistoryIdentityStatus } from "./types";

const TOKEN_A = "ct_live_alpha";
const TOKEN_B = "ct_live_beta";
const KEY_PREFIX = "persona-lifecycle-";
const API_URL = "https://api.runtype.com";

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const mounts: HTMLElement[] = [];
const controllers: Array<{ destroy: () => void }> = [];

/** Permissive init stub: every client rebuild re-inits, and none of it matters. */
const installFetch = () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      sessionId: `sess_${Math.random().toString(36).slice(2, 8)}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      flow: { id: "flow_1", name: "Flow", description: null },
      conversationId: "conv_1",
      targetId: "flow_1",
      conversationRevision: "rev_1",
      config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
    }),
  })) as unknown as typeof fetch;
};

const mount = (config: Record<string, unknown>) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  mounts.push(host);
  const controller = createAgentExperience(host, {
    apiUrl: API_URL,
    launcher: { enabled: false },
    suggestionChips: [],
    features: { history: { enabled: true } },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { host, controller };
};

describe("history controller lifecycle", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryViewLoader(async () => ({ createHistoryView }));
    installFetch();
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
    mounts.splice(0).forEach((host) => host.remove());
    recorder.instances.length = 0;
    document.body.innerHTML = "";
    window.localStorage.clear();
    Reflect.deleteProperty(globalThis.navigator, "locks");
    vi.restoreAllMocks();
  });

  describe("update() store re-key matrix", () => {
    const seed = async () => {
      const keysA = await visitorStoreKeys(TOKEN_A, KEY_PREFIX);
      const keysB = await visitorStoreKeys(TOKEN_B, KEY_PREFIX);
      window.localStorage.setItem(keysA.storageKey, "cvt_alpha");
      window.localStorage.setItem(keysB.storageKey, "cvt_beta");
      return { keysA, keysB };
    };

    it("re-keys on a client-token change without clearing the old namespace", async () => {
      const { keysA, keysB } = await seed();
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });

      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));
      const first = recorder.instances[0]!;
      expect(first.args).toEqual([TOKEN_A, KEY_PREFIX, false]);
      expect(await first.store.get()).toBe("cvt_alpha");

      controller.update({ clientToken: TOKEN_B });
      await flush(20);

      expect(recorder.instances.length).toBe(2);
      const second = recorder.instances[1]!;
      expect(second.args).toEqual([TOKEN_B, KEY_PREFIX, false]);
      // Correctly keyed: it reads the beta namespace, never alpha's secret.
      expect(await second.store.get()).toBe("cvt_beta");

      // The prior surface keeps its credential: re-keying is not a logout.
      expect(first.destroy).toHaveBeenCalledTimes(1);
      expect(first.clear).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(keysA.storageKey)).toBe("cvt_alpha");
      expect(window.localStorage.getItem(keysB.storageKey)).toBe("cvt_beta");
    });

    it("keeps the same store across an unrelated connection rebuild", async () => {
      await seed();
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));

      controller.update({ apiUrl: `${API_URL}/edge` });
      controller.update({ headers: { "x-demo": "1" } });
      await flush(20);

      // The identity tuple did not move, so the credential store survives the
      // client rebuild underneath it.
      expect(recorder.instances.length).toBe(1);
      expect(recorder.instances[0]!.destroy).not.toHaveBeenCalled();
    });

    it("rebuilds across a persistState on/off/on transition", async () => {
      const { keysA } = await seed();
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));

      controller.update({ persistState: false });
      await flush(20);
      expect(recorder.instances.length).toBe(2);
      // Persistence off also drops the custom prefix, so both tuple fields move.
      expect(recorder.instances[1]!.args).toEqual([TOKEN_A, "persona-", true]);
      // Memory-only: the durable credential is not readable through it.
      expect(await recorder.instances[1]!.store.get()).toBeNull();

      controller.update({ persistState: { keyPrefix: KEY_PREFIX } });
      await flush(20);
      expect(recorder.instances.length).toBe(3);
      expect(recorder.instances[2]!.args).toEqual([TOKEN_A, KEY_PREFIX, false]);
      expect(await recorder.instances[2]!.store.get()).toBe("cvt_alpha");

      expect(recorder.instances[0]!.clear).not.toHaveBeenCalled();
      expect(recorder.instances[1]!.clear).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(keysA.storageKey)).toBe("cvt_alpha");
    });

    it("keeps the recovery credential store when history UI is disabled", async () => {
      await seed();
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));

      controller.update({ features: { history: { enabled: false } } });
      await flush(20);

      expect(recorder.instances.length).toBe(1);
      expect(recorder.instances[0]!.destroy).not.toHaveBeenCalled();
      expect(recorder.instances[0]!.clear).not.toHaveBeenCalled();
    });
  });

  describe("external credential change (D3)", () => {
    /** Exactly what a sibling tab's write looks like: jsdom fires no event. */
    const externalClear = (storageKey: string) => {
      window.localStorage.removeItem(storageKey);
      window.dispatchEvent(
        new StorageEvent("storage", { key: storageKey, newValue: null })
      );
    };

    it("wipes the mounted transcript when a sibling revokes the credential", async () => {
      const keys = await visitorStoreKeys(TOKEN_A, KEY_PREFIX);
      window.localStorage.setItem(keys.storageKey, "cvt_alpha");
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));
      await recorder.instances[0]!.store.ready;
      await flush(20);

      controller.injectAssistantMessage({ content: "before the reset" });
      expect(controller.getMessages()).toHaveLength(1);

      externalClear(keys.storageKey);
      await flush(20);

      expect(controller.getMessages()).toHaveLength(0);
    });

    it("follows the store across an update() re-key", async () => {
      const keysA = await visitorStoreKeys(TOKEN_A, KEY_PREFIX);
      const keysB = await visitorStoreKeys(TOKEN_B, KEY_PREFIX);
      window.localStorage.setItem(keysA.storageKey, "cvt_alpha");
      window.localStorage.setItem(keysB.storageKey, "cvt_beta");
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));

      controller.update({ clientToken: TOKEN_B });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(2));
      await recorder.instances[1]!.store.ready;
      await flush(20);

      controller.injectAssistantMessage({ content: "still here" });
      // The detached alpha store no longer reaches the session.
      externalClear(keysA.storageKey);
      await flush(20);
      expect(controller.getMessages()).toHaveLength(1);

      externalClear(keysB.storageKey);
      await flush(20);
      expect(controller.getMessages()).toHaveLength(0);
    });

    it("is inert after destroy()", async () => {
      const keys = await visitorStoreKeys(TOKEN_A, KEY_PREFIX);
      window.localStorage.setItem(keys.storageKey, "cvt_alpha");
      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));
      await recorder.instances[0]!.store.ready;
      await flush(20);

      controller.injectAssistantMessage({ content: "before the reset" });
      controller.destroy();

      externalClear(keys.storageKey);
      await flush(20);

      // Nothing observes it: the message state is left exactly as destroyed.
      expect(controller.getMessages()).toHaveLength(1);
    });
  });

  describe("destroy()", () => {
    it("removes the storage listener and releases a held first-init lease", async () => {
      const keys = await visitorStoreKeys(TOKEN_A, KEY_PREFIX);
      // Seeded so the widget's own bootstrap does not contend for the lease
      // this test takes deliberately.
      window.localStorage.setItem(keys.storageKey, "cvt_alpha");
      // jsdom has no Web Locks, so first init takes the localStorage lease path.
      expect(
        (globalThis.navigator as Navigator & { locks?: unknown }).locks
      ).toBeUndefined();

      const live = new Set<unknown>();
      const originalAdd = window.addEventListener.bind(window);
      const originalRemove = window.removeEventListener.bind(window);
      const addSpy = vi
        .spyOn(window, "addEventListener")
        .mockImplementation((type, handler, options) => {
          if (type === "storage") live.add(handler);
          originalAdd(type, handler, options);
        });
      const removeSpy = vi
        .spyOn(window, "removeEventListener")
        .mockImplementation((type, handler, options) => {
          if (type === "storage") live.delete(handler);
          originalRemove(type, handler, options);
        });

      const { controller } = mount({
        clientToken: TOKEN_A,
        persistState: { keyPrefix: KEY_PREFIX },
      });
      await vi.waitFor(() => expect(recorder.instances.length).toBe(1));
      const store = recorder.instances[0]!.store;
      await store.ready;
      expect(live.size).toBeGreaterThan(0);

      let leaseWhileHeld: string | null = null;
      let leaseAfterDestroy: string | null = null;
      await store.withFirstInitLock(async () => {
        leaseWhileHeld = window.localStorage.getItem(keys.leaseKey);
        controller.destroy();
        leaseAfterDestroy = window.localStorage.getItem(keys.leaseKey);
      });

      expect(leaseWhileHeld).not.toBeNull();
      // destroy() releases the lease it owns rather than waiting for expiry.
      expect(leaseAfterDestroy).toBeNull();
      expect(recorder.instances[0]!.destroy).toHaveBeenCalledTimes(1);
      // Every storage listener the controller added is gone.
      expect(live.size).toBe(0);
      expect(addSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
  });

  describe("provider rebuild on update()", () => {
    /** Demo provider plus counted identity/availability subscriptions. */
    const countedProvider = () => {
      const base = createDemoHistoryProvider({ conversations: [] });
      const counts = {
        identitySubscribes: 0,
        identityUnsubscribes: 0,
        availabilitySubscribes: 0,
        availabilityUnsubscribes: 0,
      };
      let availability: ((available: boolean) => void) | null = null;
      const provider: HistoryProvider = {
        ...base,
        subscribeIdentityStatus(callback) {
          counts.identitySubscribes += 1;
          const off = base.subscribeIdentityStatus(callback);
          return () => {
            counts.identityUnsubscribes += 1;
            off();
          };
        },
        subscribeAvailability(callback) {
          counts.availabilitySubscribes += 1;
          availability = callback;
          return () => {
            counts.availabilityUnsubscribes += 1;
            availability = null;
          };
        },
      };
      return {
        provider,
        counts,
        setIdentityStatus: (status: HistoryIdentityStatus) =>
          base.setIdentityStatus(status),
        setAvailable: (available: boolean) => availability?.(available),
      };
    };

    it("rebinds a rebuilt provider without leaving the old subscriptions live", async () => {
      const first = countedProvider();
      const second = countedProvider();
      let next = first;
      setHistoryProviderFactory(() => next.provider);

      const { controller } = mount({});
      await flush();
      expect(first.counts.identitySubscribes).toBe(1);
      expect(first.counts.availabilitySubscribes).toBe(1);

      const seen: HistoryIdentityStatus[] = [];
      controller.on("history:identityStatusChanged", (payload) =>
        seen.push((payload as { status: HistoryIdentityStatus }).status)
      );

      // A getIdentityProof change rebuilds the provider.
      next = second;
      controller.update({ getIdentityProof: async () => "rt_eu_proof" });
      await flush(20);

      expect(first.counts.identityUnsubscribes).toBe(1);
      expect(first.counts.availabilityUnsubscribes).toBe(1);
      expect(second.counts.identitySubscribes).toBe(1);
      expect(second.counts.availabilitySubscribes).toBe(1);

      second.setIdentityStatus({ state: "verifying" });
      await flush();
      // Exactly one emission: the replaced subscription is detached, and the
      // new one is bound exactly once.
      expect(seen).toEqual([{ state: "verifying" }]);

      // The stale provider is inert: its callback no longer reaches the bus.
      first.setIdentityStatus({ state: "verified" });
      await flush();
      expect(seen).toEqual([{ state: "verifying" }]);
    });

    it("tears down provider subscriptions when history is turned off", async () => {
      const only = countedProvider();
      setHistoryProviderFactory(() => only.provider);
      const { controller } = mount({});
      await flush();

      controller.update({ features: { history: { enabled: false } } });
      await flush(20);

      expect(only.counts.identityUnsubscribes).toBe(1);
      expect(only.counts.availabilityUnsubscribes).toBe(1);
      expect(only.counts.identitySubscribes).toBe(1);
    });
  });
});
