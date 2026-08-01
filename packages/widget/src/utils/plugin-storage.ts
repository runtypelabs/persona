import type { AgentWidgetConfig } from "../types";

/**
 * Synchronous key-value store handed to plugin render hooks. Backed by
 * `localStorage`, namespaced per plugin id. The async `storageAdapter` cannot
 * back a synchronous API and `persistState` is not a general key-value surface.
 */
export interface AgentWidgetPluginStorage {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
}

/** One factory per widget instance; the in-memory fallback is shared by it. */
export type PluginStorageFactory = (
  pluginId: string
) => AgentWidgetPluginStorage;

const resolveKeyPrefix = (config: AgentWidgetConfig | undefined): string => {
  const persist = config?.persistState;
  return (
    (typeof persist === "object" ? persist?.keyPrefix : undefined) ?? "persona-"
  );
};

export const pluginStorageKey = (
  config: AgentWidgetConfig | undefined,
  pluginId: string,
  key: string
): string => `${resolveKeyPrefix(config)}plugin:${pluginId}:${key}`;

/**
 * `persistState: false` and blocked storage both downgrade to a per-instance
 * Map. localStorage access can throw (Safari private mode, partitioned
 * iframes), so the first throw switches this instance to the Map for good.
 */
export const createPluginStorageFactory = (
  getConfig: () => AgentWidgetConfig | undefined
): PluginStorageFactory => {
  const memory = new Map<string, string>();
  let blocked = false;

  const store = (): Storage | null => {
    if (blocked) return null;
    if (getConfig()?.persistState === false) return null;
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage;
    } catch {
      blocked = true;
      return null;
    }
  };

  return (pluginId: string): AgentWidgetPluginStorage => {
    const keyFor = (key: string) =>
      pluginStorageKey(getConfig(), pluginId, key);

    return {
      get: (key) => {
        const full = keyFor(key);
        const local = store();
        if (local) {
          try {
            return local.getItem(full);
          } catch {
            blocked = true;
          }
        }
        return memory.get(full) ?? null;
      },
      set: (key, value) => {
        const full = keyFor(key);
        const local = store();
        if (local) {
          try {
            local.setItem(full, value);
            return;
          } catch {
            blocked = true;
          }
        }
        memory.set(full, value);
      },
      remove: (key) => {
        const full = keyFor(key);
        memory.delete(full);
        const local = store();
        if (!local) return;
        try {
          local.removeItem(full);
        } catch {
          blocked = true;
        }
      },
    };
  };
};
