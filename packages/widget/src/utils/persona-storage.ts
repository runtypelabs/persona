/**
 * Unified async key-value storage for the widget.
 *
 * Inspired by https://github.com/unjs/unstorage. The interface is intentionally
 * a small subset — just enough to back state persistence, event-stream
 * capture, and (eventually) attachments behind a single pluggable shape.
 *
 * Drivers expose raw string get/set/remove/list. The `Storage` wrapper layered
 * on top adds JSON (de)serialization, prefix scoping, and snapshot helpers.
 */

export interface PersonaStorageDriver {
  readonly name: string;
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
  getKeys(prefix?: string): string[] | Promise<string[]>;
  clear(prefix?: string): void | Promise<void>;
  watch?(callback: PersonaStorageWatchCallback): PersonaStorageUnwatch;
}

export type PersonaStorageWatchEvent = "update" | "remove";
export type PersonaStorageWatchCallback = (
  event: PersonaStorageWatchEvent,
  key: string
) => void;
export type PersonaStorageUnwatch = () => void;

export interface PersonaStorage {
  readonly driver: PersonaStorageDriver;
  getItem<T = unknown>(key: string): Promise<T | null>;
  setItem<T = unknown>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  hasItem(key: string): Promise<boolean>;
  getKeys(prefix?: string): Promise<string[]>;
  clear(prefix?: string): Promise<void>;
  watch(callback: PersonaStorageWatchCallback): PersonaStorageUnwatch;
  snapshot(prefix?: string): Promise<Record<string, unknown>>;
  restore(snapshot: Record<string, unknown>): Promise<void>;
}

const logError = (scope: string, error: unknown) => {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.error(`[persona-storage:${scope}]`, error);
  }
};

const safeJsonParse = <T>(value: string | null): T | null => {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logError("parse", error);
    return null;
  }
};

export const createMemoryDriver = (): PersonaStorageDriver => {
  const map = new Map<string, string>();
  const watchers = new Set<PersonaStorageWatchCallback>();
  const emit = (event: PersonaStorageWatchEvent, key: string) => {
    for (const cb of watchers) cb(event, key);
  };
  return {
    name: "memory",
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
      emit("update", key);
    },
    removeItem: (key) => {
      if (map.delete(key)) emit("remove", key);
    },
    getKeys: (prefix) =>
      [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)),
    clear: (prefix) => {
      for (const key of [...map.keys()]) {
        if (!prefix || key.startsWith(prefix)) {
          map.delete(key);
          emit("remove", key);
        }
      }
    },
    watch: (callback) => {
      watchers.add(callback);
      return () => watchers.delete(callback);
    }
  };
};

export interface LocalStorageDriverOptions {
  /**
   * Optional prefix prepended to every key written through this driver.
   * Useful for isolating one widget instance from another on the same origin.
   */
  prefix?: string;
  /** Inject a non-default Storage (for tests). Defaults to window.localStorage. */
  storage?: Storage;
}

export const createLocalStorageDriver = (
  options: LocalStorageDriverOptions = {}
): PersonaStorageDriver => {
  const prefix = options.prefix ?? "";
  const resolveStorage = (): Storage | null => {
    if (options.storage) return options.storage;
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  };

  const fullKey = (key: string) => `${prefix}${key}`;
  const stripPrefix = (key: string) =>
    prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;

  const watchers = new Set<PersonaStorageWatchCallback>();
  let detachStorageEvent: (() => void) | null = null;
  const ensureStorageEventBridge = () => {
    if (detachStorageEvent || typeof window === "undefined") return;
    const handler = (event: StorageEvent) => {
      if (!event.key) return;
      if (prefix && !event.key.startsWith(prefix)) return;
      const stripped = stripPrefix(event.key);
      const eventType: PersonaStorageWatchEvent =
        event.newValue === null ? "remove" : "update";
      for (const cb of watchers) cb(eventType, stripped);
    };
    window.addEventListener("storage", handler);
    detachStorageEvent = () => window.removeEventListener("storage", handler);
  };
  const emitLocal = (event: PersonaStorageWatchEvent, key: string) => {
    for (const cb of watchers) cb(event, key);
  };

  return {
    name: "localStorage",
    getItem: (key) => {
      const storage = resolveStorage();
      if (!storage) return null;
      try {
        return storage.getItem(fullKey(key));
      } catch (error) {
        logError("localStorage.getItem", error);
        return null;
      }
    },
    setItem: (key, value) => {
      const storage = resolveStorage();
      if (!storage) return;
      try {
        storage.setItem(fullKey(key), value);
        emitLocal("update", key);
      } catch (error) {
        logError("localStorage.setItem", error);
      }
    },
    removeItem: (key) => {
      const storage = resolveStorage();
      if (!storage) return;
      try {
        storage.removeItem(fullKey(key));
        emitLocal("remove", key);
      } catch (error) {
        logError("localStorage.removeItem", error);
      }
    },
    getKeys: (scopePrefix) => {
      const storage = resolveStorage();
      if (!storage) return [];
      const keys: string[] = [];
      const fullScope = scopePrefix ? fullKey(scopePrefix) : prefix;
      try {
        for (let i = 0; i < storage.length; i++) {
          const raw = storage.key(i);
          if (raw === null) continue;
          if (fullScope && !raw.startsWith(fullScope)) continue;
          keys.push(stripPrefix(raw));
        }
      } catch (error) {
        logError("localStorage.getKeys", error);
      }
      return keys;
    },
    clear: (scopePrefix) => {
      const storage = resolveStorage();
      if (!storage) return;
      const fullScope = scopePrefix ? fullKey(scopePrefix) : prefix;
      try {
        const targets: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const raw = storage.key(i);
          if (raw === null) continue;
          if (fullScope && !raw.startsWith(fullScope)) continue;
          targets.push(raw);
        }
        for (const raw of targets) {
          storage.removeItem(raw);
          emitLocal("remove", stripPrefix(raw));
        }
      } catch (error) {
        logError("localStorage.clear", error);
      }
    },
    watch: (callback) => {
      ensureStorageEventBridge();
      watchers.add(callback);
      return () => {
        watchers.delete(callback);
        if (watchers.size === 0 && detachStorageEvent) {
          detachStorageEvent();
          detachStorageEvent = null;
        }
      };
    }
  };
};

export interface IndexedDBDriverOptions {
  /** Database name. Defaults to `persona-storage`. */
  dbName?: string;
  /** Object store name. Defaults to `kv`. */
  storeName?: string;
  /** Optional key prefix prepended to every stored key. */
  prefix?: string;
}

/**
 * IndexedDB-backed driver. Each entry is a single row keyed by string;
 * values are stored as already-serialized strings (the `Storage` wrapper
 * handles JSON encoding). The database is opened lazily on first use.
 */
export const createIndexedDBDriver = (
  options: IndexedDBDriverOptions = {}
): PersonaStorageDriver => {
  const dbName = options.dbName ?? "persona-storage";
  const storeName = options.storeName ?? "kv";
  const prefix = options.prefix ?? "";
  const fullKey = (key: string) => `${prefix}${key}`;
  const stripPrefix = (key: string) =>
    prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;

  const watchers = new Set<PersonaStorageWatchCallback>();
  const emit = (event: PersonaStorageWatchEvent, key: string) => {
    for (const cb of watchers) cb(event, key);
  };

  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const getDB = (): Promise<IDBDatabase | null> => {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === "undefined") {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          logError("indexedDB.open", request.error);
          resolve(null);
        };
      } catch (error) {
        logError("indexedDB.open", error);
        resolve(null);
      }
    });
    return dbPromise;
  };

  const runRequest = <T>(
    mode: "readonly" | "readwrite",
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T | null> =>
    getDB().then(
      (db) =>
        new Promise<T | null>((resolve) => {
          if (!db) return resolve(null);
          try {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = action(store);
            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => {
              logError("indexedDB.request", request.error);
              resolve(null);
            };
          } catch (error) {
            logError("indexedDB.transaction", error);
            resolve(null);
          }
        })
    );

  return {
    name: "indexedDB",
    getItem: async (key) => {
      const result = await runRequest<unknown>("readonly", (store) =>
        store.get(fullKey(key))
      );
      return result === undefined || result === null
        ? null
        : (result as string);
    },
    setItem: async (key, value) => {
      await runRequest("readwrite", (store) => store.put(value, fullKey(key)));
      emit("update", key);
    },
    removeItem: async (key) => {
      await runRequest("readwrite", (store) => store.delete(fullKey(key)));
      emit("remove", key);
    },
    getKeys: async (scopePrefix) => {
      const fullScope = scopePrefix ? fullKey(scopePrefix) : prefix;
      const keys = (await runRequest<unknown[]>("readonly", (store) =>
        store.getAllKeys() as IDBRequest<unknown[]>
      )) as unknown[] | null;
      if (!keys) return [];
      const result: string[] = [];
      for (const key of keys) {
        if (typeof key !== "string") continue;
        if (fullScope && !key.startsWith(fullScope)) continue;
        result.push(stripPrefix(key));
      }
      return result;
    },
    clear: async (scopePrefix) => {
      const fullScope = scopePrefix ? fullKey(scopePrefix) : prefix;
      if (!fullScope) {
        await runRequest("readwrite", (store) => store.clear());
        emit("remove", "");
        return;
      }
      const allKeys = (await runRequest<unknown[]>("readonly", (store) =>
        store.getAllKeys() as IDBRequest<unknown[]>
      )) as unknown[] | null;
      if (!allKeys) return;
      const targets: string[] = [];
      for (const key of allKeys) {
        if (typeof key === "string" && key.startsWith(fullScope)) {
          targets.push(key);
        }
      }
      await Promise.all(
        targets.map((raw) =>
          runRequest("readwrite", (store) => store.delete(raw))
        )
      );
      for (const raw of targets) emit("remove", stripPrefix(raw));
    },
    watch: (callback) => {
      watchers.add(callback);
      return () => {
        watchers.delete(callback);
      };
    }
  };
};

const wrapDriver = (driver: PersonaStorageDriver): PersonaStorage => {
  const watchers = new Set<PersonaStorageWatchCallback>();
  let detachDriverWatch: PersonaStorageUnwatch | null = null;
  const ensureWatchBridge = () => {
    if (detachDriverWatch || !driver.watch) return;
    detachDriverWatch = driver.watch((event, key) => {
      for (const cb of watchers) cb(event, key);
    });
  };

  const storage: PersonaStorage = {
    driver,
    async getItem<T = unknown>(key: string): Promise<T | null> {
      const raw = await driver.getItem(key);
      return safeJsonParse<T>(raw);
    },
    async setItem<T = unknown>(key: string, value: T): Promise<void> {
      try {
        await driver.setItem(key, JSON.stringify(value));
      } catch (error) {
        logError("setItem", error);
      }
    },
    async removeItem(key) {
      await driver.removeItem(key);
    },
    async hasItem(key) {
      const raw = await driver.getItem(key);
      return raw !== null && raw !== undefined;
    },
    async getKeys(prefix) {
      return driver.getKeys(prefix);
    },
    async clear(prefix) {
      await driver.clear(prefix);
    },
    watch(callback) {
      ensureWatchBridge();
      watchers.add(callback);
      return () => {
        watchers.delete(callback);
        if (watchers.size === 0 && detachDriverWatch) {
          detachDriverWatch();
          detachDriverWatch = null;
        }
      };
    },
    async snapshot(prefix) {
      const keys = await driver.getKeys(prefix);
      const out: Record<string, unknown> = {};
      await Promise.all(
        keys.map(async (key) => {
          const raw = await driver.getItem(key);
          out[key] = safeJsonParse(raw);
        })
      );
      return out;
    },
    async restore(snapshot) {
      await Promise.all(
        Object.entries(snapshot).map(([key, value]) =>
          driver.setItem(key, JSON.stringify(value))
        )
      );
    }
  };
  return storage;
};

export interface CreateStorageOptions {
  driver?: PersonaStorageDriver;
}

export const createStorage = (
  options: CreateStorageOptions = {}
): PersonaStorage => wrapDriver(options.driver ?? createMemoryDriver());

interface BroadcastMessage {
  sender: string;
  event: PersonaStorageWatchEvent;
  key: string;
}

export interface BroadcastChannelOptions {
  /**
   * BroadcastChannel name. Defaults to `persona-storage`. Pick a unique name
   * if multiple independent stores share the same origin.
   */
  channelName?: string;
}

/**
 * Wraps a `PersonaStorage` so that local writes broadcast watch events to
 * other browser tabs/contexts on the same origin via the BroadcastChannel
 * API. Subscribers via `wrapped.watch()` receive both local-write events
 * (from the underlying driver) and remote-write events (from other tabs).
 *
 * Reads, writes, and snapshots pass straight through — only watch events are
 * shared across tabs. In environments without BroadcastChannel, this is a
 * no-op pass-through.
 *
 * Note: this layer does not arbitrate concurrent writers. Two tabs writing
 * to the same key still last-write-wins. Use Web Locks (`navigator.locks`)
 * or a "single interactive tab" pattern to coordinate writers when needed.
 */
export const withBroadcastChannel = (
  storage: PersonaStorage,
  options: BroadcastChannelOptions = {}
): PersonaStorage => {
  const channelName = options.channelName ?? "persona-storage";
  const senderId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const watchers = new Set<PersonaStorageWatchCallback>();
  let channel: BroadcastChannel | null = null;
  let detachLocal: PersonaStorageUnwatch | null = null;

  const ensureBridge = () => {
    if (channel || typeof BroadcastChannel === "undefined") return;
    try {
      channel = new BroadcastChannel(channelName);
    } catch (error) {
      logError("broadcastChannel.open", error);
      return;
    }
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const data = event.data;
      if (!data || data.sender === senderId) return;
      for (const cb of watchers) cb(data.event, data.key);
    };
    detachLocal = storage.watch((event, key) => {
      for (const cb of watchers) cb(event, key);
    });
  };

  const teardownBridge = () => {
    if (watchers.size > 0) return;
    detachLocal?.();
    detachLocal = null;
    channel?.close();
    channel = null;
  };

  const broadcast = (event: PersonaStorageWatchEvent, key: string) => {
    if (!channel) return;
    try {
      channel.postMessage({ sender: senderId, event, key } satisfies BroadcastMessage);
    } catch (error) {
      logError("broadcastChannel.postMessage", error);
    }
  };

  return {
    driver: storage.driver,
    getItem: (key) => storage.getItem(key),
    hasItem: (key) => storage.hasItem(key),
    getKeys: (prefix) => storage.getKeys(prefix),
    snapshot: (prefix) => storage.snapshot(prefix),
    restore: (snap) => storage.restore(snap),
    async setItem(key, value) {
      ensureBridge();
      await storage.setItem(key, value);
      broadcast("update", key);
    },
    async removeItem(key) {
      ensureBridge();
      await storage.removeItem(key);
      broadcast("remove", key);
    },
    async clear(prefix) {
      ensureBridge();
      const keys = await storage.getKeys(prefix);
      await storage.clear(prefix);
      for (const key of keys) broadcast("remove", key);
    },
    watch(callback) {
      ensureBridge();
      watchers.add(callback);
      return () => {
        watchers.delete(callback);
        teardownBridge();
      };
    }
  };
};

/**
 * Returns a view of `parent` scoped under `prefix`. Reads, writes, and watches
 * transparently apply the prefix; consumers see un-prefixed keys.
 */
export const prefixStorage = (
  parent: PersonaStorage,
  prefix: string
): PersonaStorage => {
  const join = (key: string) => `${prefix}${key}`;
  const strip = (key: string) =>
    key.startsWith(prefix) ? key.slice(prefix.length) : key;

  return {
    driver: parent.driver,
    getItem: (key) => parent.getItem(join(key)),
    setItem: (key, value) => parent.setItem(join(key), value),
    removeItem: (key) => parent.removeItem(join(key)),
    hasItem: (key) => parent.hasItem(join(key)),
    getKeys: async (scope) => {
      const keys = await parent.getKeys(scope ? join(scope) : prefix);
      return keys.map(strip);
    },
    clear: (scope) => parent.clear(scope ? join(scope) : prefix),
    watch: (callback) =>
      parent.watch((event, key) => {
        if (!key.startsWith(prefix)) return;
        callback(event, strip(key));
      }),
    snapshot: async (scope) => {
      const snap = await parent.snapshot(scope ? join(scope) : prefix);
      return Object.fromEntries(
        Object.entries(snap).map(([key, value]) => [strip(key), value])
      );
    },
    restore: (snapshot) => {
      const remapped = Object.fromEntries(
        Object.entries(snapshot).map(([key, value]) => [join(key), value])
      );
      return parent.restore(remapped);
    }
  };
};
