import type {
  AgentWidgetMessage,
  AgentWidgetStorageAdapter,
  AgentWidgetStoredState,
  PersonaArtifactRecord
} from "../types";
import type { PersonaStorage } from "./persona-storage";

const safeJsonParse = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[AgentWidget] Failed to parse stored state:", error);
    }
    return null;
  }
};

const sanitizeMessages = (messages: AgentWidgetMessage[]) =>
  messages.map((message) => ({
    ...message,
    streaming: false
  }));

const sanitizeArtifacts = (artifacts: PersonaArtifactRecord[]) =>
  artifacts.map((artifact) => ({
    ...artifact,
    status: "complete" as const
  }));

const sanitizeStateForPersistence = (
  state: AgentWidgetStoredState
): AgentWidgetStoredState => ({
  ...state,
  messages: state.messages ? sanitizeMessages(state.messages) : undefined,
  artifacts: state.artifacts ? sanitizeArtifacts(state.artifacts) : undefined
});

export const createLocalStorageAdapter = (
  key = "persona-state"
): AgentWidgetStorageAdapter => {
  const getStorage = () => {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  };

  return {
    load: () => {
      const storage = getStorage();
      if (!storage) return null;
      return safeJsonParse(storage.getItem(key));
    },
    save: (state: AgentWidgetStoredState) => {
      const storage = getStorage();
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(sanitizeStateForPersistence(state)));
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Failed to persist state:", error);
        }
      }
    },
    clear: () => {
      const storage = getStorage();
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Failed to clear stored state:", error);
        }
      }
    }
  };
};

/**
 * Adapter factory backed by a `PersonaStorage` instance. Unlike the legacy
 * `createLocalStorageAdapter`, this is fully async — callers must be prepared
 * for `load`/`save`/`clear` to return Promises. Use this when composing with
 * non-localStorage drivers (memory, IndexedDB, HTTP, etc.) or when you want
 * snapshot/watch capabilities on the underlying storage.
 */
export const createStorageAdapter = (
  storage: PersonaStorage,
  key = "persona-state"
): AgentWidgetStorageAdapter => ({
  load: () => storage.getItem<AgentWidgetStoredState>(key),
  save: (state) => storage.setItem(key, sanitizeStateForPersistence(state)),
  clear: () => storage.removeItem(key)
});
