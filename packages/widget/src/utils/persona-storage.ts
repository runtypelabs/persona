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
