import type {
  AgentWidgetMessage,
  AgentWidgetStorageAdapter,
  AgentWidgetStoredState,
  PersonaArtifactRecord
} from "../types";

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

const DEFAULT_PERSIST_KEY_PREFIX = "persona-";

/**
 * The widget's default transcript key, scoped by `persistState.keyPrefix` so
 * two widgets on one origin with distinct prefixes keep separate transcripts.
 * The default prefix yields the legacy `"persona-state"` key, so unprefixed
 * widgets keep their stored conversation; prefixed widgets never adopt it.
 */
export const transcriptStorageKey = (keyPrefix?: string): string =>
  `${keyPrefix ?? DEFAULT_PERSIST_KEY_PREFIX}state`;

export const createLocalStorageAdapter = (
  key = transcriptStorageKey()
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
        const payload: AgentWidgetStoredState = {
          ...state,
          messages: state.messages ? sanitizeMessages(state.messages) : undefined,
          artifacts: state.artifacts ? sanitizeArtifacts(state.artifacts) : undefined
        };
        storage.setItem(key, JSON.stringify(payload));
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

