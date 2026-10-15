/**
 * Durable visitor-credential store for per-visitor conversation history
 * (client-token mode only). Holds the raw `cvt_…` secret under a localStorage
 * key namespaced by a hash of the client token, degrades to memory after the
 * first storage throw, and observes cross-tab changes through the `storage`
 * event. One instance is owned by the controller and injected into every
 * `AgentWidgetClient` it builds; reuse is keyed on the identity tuple
 * `(clientToken, keyPrefix, persistDisabled)`.
 */

export interface VisitorStoreChange {
  previousToken: string | null;
  token: string | null;
  /** "local" = this store's own set/clear; "external" = observed from outside. */
  source: "local" | "external";
  revision: number;
}

export interface VisitorStore {
  /** Resolves once the hashed storage key exists; every op awaits it. */
  readonly ready: Promise<void>;
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
  /** Monotonic per instance; advances on every observed value change. */
  revision(): number;
  subscribe(callback: (change: VisitorStoreChange) => void): () => void;
  /**
   * Serialize the empty-store first init across same-origin tabs. Web Locks
   * when available; otherwise a best-effort localStorage lease (collision
   * reduction, not proof of exclusivity). Callers must re-read the store
   * inside `fn` and hold the lock through mint + write + immediate claim.
   */
  withFirstInitLock<T>(fn: () => Promise<T>): Promise<T>;
  matches(
    clientToken: string,
    keyPrefix: string,
    persistDisabled: boolean
  ): boolean;
  destroy(): void;
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

interface LeaseRecord {
  ownerNonce: string;
  expiresAt: number;
}

/** Non-crypto fallback for non-secure contexts without `crypto.subtle`. */
const fnv1aHex = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * Namespacing hash only, not a security boundary: it keeps the raw `ct_`
 * token out of storage keys and separates surfaces sharing an origin.
 */
export const hashClientToken = async (clientToken: string): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest(
        "SHA-256",
        new TextEncoder().encode(clientToken)
      );
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Non-secure context: fall through to the sync hash.
    }
  }
  return fnv1aHex(clientToken);
};

export const visitorStoreKeys = async (
  clientToken: string,
  keyPrefix: string
): Promise<{ storageKey: string; leaseKey: string; lockName: string }> => {
  const tokenHash = await hashClientToken(clientToken);
  return {
    storageKey: `${keyPrefix}visitor:${tokenHash}`,
    leaseKey: `${keyPrefix}visitor-init-lock:${tokenHash}`,
    lockName: `persona-visitor-init:${await hashClientToken(
      `${clientToken}\0${keyPrefix}`
    )}`,
  };
};

const LEASE_MS = 10_000;
const LEASE_WAIT_CAP_MS = 15_000;

export const createVisitorStore = (
  clientToken: string,
  keyPrefix: string,
  persistDisabled: boolean
): VisitorStore => {
  let storageKey = "";
  let leaseKey = "";
  let lockName = "";
  let blocked = false;
  let destroyed = false;
  let currentRevision = 0;
  let lastKnown: string | null = null;
  let heldLeaseNonce: string | null = null;
  const subscribers = new Set<(change: VisitorStoreChange) => void>();

  const localStore = (): Storage | null => {
    if (persistDisabled || blocked) return null;
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage;
    } catch {
      blocked = true;
      return null;
    }
  };

  const readRaw = (): string | null => {
    const store = localStore();
    if (!store) return lastKnown;
    try {
      return store.getItem(storageKey);
    } catch {
      blocked = true;
      return lastKnown;
    }
  };

  const observe = (value: string | null, source: "local" | "external") => {
    if (destroyed || value === lastKnown) return;
    const previousToken = lastKnown;
    lastKnown = value;
    currentRevision += 1;
    const change: VisitorStoreChange = {
      previousToken,
      token: value,
      source,
      revision: currentRevision,
    };
    for (const callback of subscribers) callback(change);
  };

  const onStorage = (event: StorageEvent) => {
    if (destroyed) return;
    // key === null is a whole-store clear(); our value is gone with it.
    if (event.key !== null && event.key !== storageKey) return;
    observe(event.key === null ? null : (event.newValue ?? null), "external");
  };

  const ready = (async () => {
    const keys = await visitorStoreKeys(clientToken, keyPrefix);
    storageKey = keys.storageKey;
    leaseKey = keys.leaseKey;
    lockName = keys.lockName;
    // Hydrate silently: an existing credential at boot is not a "change".
    lastKnown = readRaw();
    if (!persistDisabled && typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
  })();

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const readLease = (): LeaseRecord | null => {
    const store = localStore();
    if (!store) return null;
    try {
      const raw = store.getItem(leaseKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LeaseRecord;
      return typeof parsed?.expiresAt === "number" &&
        typeof parsed?.ownerNonce === "string"
        ? parsed
        : null;
    } catch {
      return null;
    }
  };

  const removeOwnLease = (nonce: string) => {
    const store = localStore();
    if (!store) return;
    try {
      if (readLease()?.ownerNonce === nonce) store.removeItem(leaseKey);
    } catch {
      // Expiry reclaims an unremovable lease.
    }
  };

  /**
   * A first init still queued behind another tab's lock when this store is
   * destroyed must not run: it would mint a visitor and write the token and
   * session after teardown, racing the replacement store for the same keys.
   * The in-flight `withFirstInitLock` rejects instead; `destroy()` wakes any
   * lease waiter so the rejection is immediate rather than up to a poll late.
   */
  const leaseWaiters = new Set<() => void>();
  const runGuarded = <T>(fn: () => Promise<T>): Promise<T> =>
    destroyed
      ? Promise.reject(
          new Error("Visitor store destroyed before its first init could start")
        )
      : fn();

  /** Storage-change wakeup with a timeout floor; same-tab writers fire no event. */
  const waitForLeaseChange = (timeoutMs: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      function done() {
        clearTimeout(timer);
        leaseWaiters.delete(done);
        window.removeEventListener("storage", wake);
        resolve();
      }
      function wake(event: StorageEvent) {
        if (event.key === null || event.key === leaseKey) done();
      }
      leaseWaiters.add(done);
      window.addEventListener("storage", wake);
    });

  const leaseLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const nonce = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const deadline = Date.now() + LEASE_WAIT_CAP_MS;
    while (!destroyed && Date.now() < deadline) {
      const store = localStore();
      if (!store) break;
      const now = Date.now();
      const lease = readLease();
      if (lease && lease.expiresAt > now && lease.ownerNonce !== nonce) {
        await waitForLeaseChange(Math.min(lease.expiresAt - now, 500));
        continue;
      }
      try {
        store.setItem(
          leaseKey,
          JSON.stringify({
            ownerNonce: nonce,
            expiresAt: now + LEASE_MS,
          } satisfies LeaseRecord)
        );
      } catch {
        blocked = true;
        break;
      }
      // localStorage has no compare-and-set: re-read after a randomized
      // contention window and yield if another writer overwrote us.
      await sleep(20 + Math.random() * 40);
      if (readLease()?.ownerNonce !== nonce) {
        await waitForLeaseChange(500);
        continue;
      }
      heldLeaseNonce = nonce;
      try {
        return await runGuarded(fn);
      } finally {
        heldLeaseNonce = null;
        removeOwnLease(nonce);
      }
    }
    // Cap or storage loss: proceed unlocked, the documented rare-race mode.
    return runGuarded(fn);
  };

  return {
    ready,

    async get() {
      await ready;
      // Drift from a same-document sibling writer fires no storage event;
      // reading is the only observation point, so count it as external.
      observe(readRaw(), "external");
      return lastKnown;
    },

    async set(token: string) {
      await ready;
      const store = localStore();
      if (store) {
        try {
          store.setItem(storageKey, token);
        } catch {
          blocked = true;
        }
      }
      observe(token, "local");
    },

    async clear() {
      await ready;
      const store = localStore();
      if (store) {
        try {
          store.removeItem(storageKey);
        } catch {
          blocked = true;
        }
      }
      observe(null, "local");
    },

    revision() {
      return currentRevision;
    },

    subscribe(callback) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },

    async withFirstInitLock(fn) {
      await ready;
      const locks = (
        globalThis.navigator as Navigator & { locks?: LockManagerLike }
      )?.locks;
      if (locks?.request) {
        return locks.request(lockName, () => runGuarded(fn));
      }
      // No-persistence and degraded-memory modes cannot coordinate tabs.
      if (!localStore()) return runGuarded(fn);
      return leaseLock(fn);
    },

    matches(otherToken, otherPrefix, otherPersistDisabled) {
      return (
        otherToken === clientToken &&
        otherPrefix === keyPrefix &&
        otherPersistDisabled === persistDisabled
      );
    },

    destroy() {
      destroyed = true;
      subscribers.clear();
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
      if (heldLeaseNonce) removeOwnLease(heldLeaseNonce);
      for (const wake of [...leaseWaiters]) wake();
    },
  };
};
