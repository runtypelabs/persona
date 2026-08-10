// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createVisitorStore,
  visitorStoreKeys,
  type VisitorStore,
  type VisitorStoreChange,
} from "./visitor-store";

const CLIENT_TOKEN = "ct_live_abc123";
const PREFIX = "persona-";

interface LeaseShape {
  ownerNonce?: unknown;
  expiresAt?: unknown;
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

type NavigatorWithLocks = Navigator & { locks?: LockManagerLike };

const sha256Hex = async (input: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Let the store's async `ready` chain and any queued microtasks settle. */
const flush = () => sleep(0);

const stores: VisitorStore[] = [];
const makeStore = (
  clientToken = CLIENT_TOKEN,
  keyPrefix = PREFIX,
  persistDisabled = false
): VisitorStore => {
  const store = createVisitorStore(clientToken, keyPrefix, persistDisabled);
  stores.push(store);
  return store;
};

/** Serializes callbacks per lock name, like a real single-mode Web Lock. */
const installFakeLocks = (): { requests: string[] } => {
  const chains = new Map<string, Promise<unknown>>();
  const requests: string[] = [];
  const manager: LockManagerLike = {
    request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
      requests.push(name);
      const previous = chains.get(name) ?? Promise.resolve();
      const run = previous.then(() => callback());
      chains.set(
        name,
        run.then(
          () => undefined,
          () => undefined
        )
      );
      return run;
    },
  };
  Object.defineProperty(globalThis.navigator, "locks", {
    value: manager,
    configurable: true,
    writable: true,
  });
  return { requests };
};

describe("visitor store", () => {
  afterEach(() => {
    for (const store of stores.splice(0)) store.destroy();
    // lib.dom types `Navigator.locks` as required, so drop it reflectively.
    Reflect.deleteProperty(globalThis.navigator, "locks");
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("namespaces the storage key by key prefix and a sha-256 of the client token", async () => {
    const hash = await sha256Hex(CLIENT_TOKEN);
    const keys = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);

    expect(keys.storageKey).toBe(`persona-visitor:${hash}`);
    expect(keys.leaseKey).toBe(`persona-visitor-init-lock:${hash}`);
    expect(keys.storageKey).not.toContain(CLIENT_TOKEN);

    const scoped = await visitorStoreKeys(CLIENT_TOKEN, "myapp-");
    expect(scoped.storageKey).toBe(`myapp-visitor:${hash}`);
    // The lock name also folds in the prefix, so two surfaces do not share it.
    expect(scoped.lockName).not.toBe(keys.lockName);
  });

  it("round-trips the raw token string under the namespaced key", async () => {
    const { storageKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore();

    await store.set("cvt_alpha");

    expect(window.localStorage.getItem(storageKey)).toBe("cvt_alpha");
    expect(await store.get()).toBe("cvt_alpha");

    await store.clear();
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(await store.get()).toBeNull();
  });

  it("hydrates an existing credential silently at boot", async () => {
    const { storageKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    window.localStorage.setItem(storageKey, "cvt_seeded");

    const store = makeStore();
    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    expect(await store.get()).toBe("cvt_seeded");
    expect(store.revision()).toBe(0);
    expect(changes).toEqual([]);
  });

  it("bumps the revision and notifies once on a local set", async () => {
    const store = makeStore();
    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    await store.set("cvt_alpha");

    expect(store.revision()).toBe(1);
    expect(changes).toEqual([
      {
        previousToken: null,
        token: "cvt_alpha",
        source: "local",
        revision: 1,
      },
    ]);
  });

  it("treats a set of the same value as a no-op", async () => {
    const store = makeStore();
    await store.set("cvt_alpha");

    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));
    await store.set("cvt_alpha");

    expect(store.revision()).toBe(1);
    expect(changes).toEqual([]);
  });

  it("adopts an external token replacement from a storage event", async () => {
    const { storageKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore();
    await store.set("cvt_alpha");

    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    // Another tab replaced the credential: value first, then the notification.
    window.localStorage.setItem(storageKey, "cvt_beta");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey,
        oldValue: "cvt_alpha",
        newValue: "cvt_beta",
      })
    );

    expect(changes).toEqual([
      {
        previousToken: "cvt_alpha",
        token: "cvt_beta",
        source: "external",
        revision: 2,
      },
    ]);
    expect(store.revision()).toBe(2);
    expect(await store.get()).toBe("cvt_beta");
  });

  it("observes null when another tab clears the whole store (key: null)", async () => {
    const store = makeStore();
    await store.set("cvt_alpha");

    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    window.localStorage.clear();
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, oldValue: null, newValue: null })
    );

    expect(changes).toEqual([
      {
        previousToken: "cvt_alpha",
        token: null,
        source: "external",
        revision: 2,
      },
    ]);
    expect(await store.get()).toBeNull();
  });

  it("ignores storage events for unrelated keys", async () => {
    const store = makeStore();
    await store.set("cvt_alpha");

    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "persona-plugin:home-screen:view",
        oldValue: null,
        newValue: "home",
      })
    );

    expect(changes).toEqual([]);
    expect(store.revision()).toBe(1);
  });

  it("keeps the token in memory only when persistence is disabled", async () => {
    const { storageKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore(CLIENT_TOKEN, PREFIX, true);

    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    await store.set("cvt_alpha");

    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(await store.get()).toBe("cvt_alpha");
    expect(store.revision()).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.source).toBe("local");
  });

  it("degrades to memory when localStorage throws (private mode)", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    const store = makeStore();
    await expect(store.set("cvt_alpha")).resolves.toBeUndefined();
    expect(await store.get()).toBe("cvt_alpha");

    setItem.mockRestore();
    getItem.mockRestore();
  });

  it("detects same-document drift on get() and reports it as external", async () => {
    const { storageKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore();
    await store.set("cvt_alpha");

    const changes: VisitorStoreChange[] = [];
    store.subscribe((change) => changes.push(change));

    // A sibling writer in this same document fires no storage event.
    window.localStorage.setItem(storageKey, "cvt_gamma");

    expect(await store.get()).toBe("cvt_gamma");
    expect(store.revision()).toBe(2);
    expect(changes).toEqual([
      {
        previousToken: "cvt_alpha",
        token: "cvt_gamma",
        source: "external",
        revision: 2,
      },
    ]);
  });

  it("stops notifying after unsubscribe and after destroy", async () => {
    const { storageKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore();
    const first = vi.fn();
    const unsubscribe = store.subscribe(first);

    await store.set("cvt_alpha");
    expect(first).toHaveBeenCalledTimes(1);

    unsubscribe();
    await store.set("cvt_beta");
    expect(first).toHaveBeenCalledTimes(1);

    store.destroy();
    const afterDestroy = vi.fn();
    store.subscribe(afterDestroy);
    const revisionAtDestroy = store.revision();

    window.localStorage.setItem(storageKey, "cvt_delta");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey,
        oldValue: "cvt_beta",
        newValue: "cvt_delta",
      })
    );

    expect(afterDestroy).not.toHaveBeenCalled();
    expect(store.revision()).toBe(revisionAtDestroy);
  });

  it("matches only on the full identity tuple", () => {
    const store = makeStore();

    expect(store.matches(CLIENT_TOKEN, PREFIX, false)).toBe(true);
    expect(store.matches("ct_live_other", PREFIX, false)).toBe(false);
    expect(store.matches(CLIENT_TOKEN, "myapp-", false)).toBe(false);
    expect(store.matches(CLIENT_TOKEN, PREFIX, true)).toBe(false);
  });

  it("serializes first init through Web Locks when available", async () => {
    const { requests } = installFakeLocks();
    const { lockName } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore();
    await store.ready;

    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = store.withFirstInitLock(async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
      return "a";
    });
    const second = store.withFirstInitLock(async () => {
      order.push("second:start");
      return "b";
    });

    await flush();
    expect(order).toEqual(["first:start"]);

    releaseFirst();
    expect(await first).toBe("a");
    expect(await second).toBe("b");
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
    expect(requests).toEqual([lockName, lockName]);
  });

  it("falls back to a secret-free localStorage lease without Web Locks", async () => {
    expect((globalThis.navigator as NavigatorWithLocks).locks).toBeUndefined();

    const { leaseKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const store = makeStore();
    await store.set("cvt_secret_value");

    const seen: { lease: string | null } = { lease: null };
    const result = await store.withFirstInitLock(async () => {
      seen.lease = window.localStorage.getItem(leaseKey);
      return "done";
    });

    expect(result).toBe("done");
    expect(typeof seen.lease).toBe("string");

    const raw = String(seen.lease);
    const parsed = JSON.parse(raw) as LeaseShape;
    expect(typeof parsed.ownerNonce).toBe("string");
    expect(typeof parsed.expiresAt).toBe("number");
    expect(Number(parsed.expiresAt)).toBeGreaterThan(Date.now());
    expect(raw).not.toContain(CLIENT_TOKEN);
    expect(raw).not.toContain("cvt_");

    expect(window.localStorage.getItem(leaseKey)).toBeNull();
  });

  it("recovers an expired foreign lease", async () => {
    const { leaseKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    window.localStorage.setItem(
      leaseKey,
      JSON.stringify({ ownerNonce: "foreign", expiresAt: Date.now() - 60_000 })
    );

    const store = makeStore();
    const fn = vi.fn(async () => "minted");

    expect(await store.withFirstInitLock(fn)).toBe("minted");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(leaseKey)).toBeNull();
  });

  it("lets two contending instances both complete and leaves no lease row", async () => {
    const { leaseKey } = await visitorStoreKeys(CLIENT_TOKEN, PREFIX);
    const storeA = makeStore();
    const storeB = makeStore();
    await Promise.all([storeA.ready, storeB.ready]);

    const [a, b] = await Promise.all([
      storeA.withFirstInitLock(async () => {
        await sleep(5);
        return "a";
      }),
      storeB.withFirstInitLock(async () => {
        await sleep(5);
        return "b";
      }),
    ]);

    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(window.localStorage.getItem(leaseKey)).toBeNull();
  }, 20_000);
});
