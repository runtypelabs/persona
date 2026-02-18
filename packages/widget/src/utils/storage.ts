import type {
  AgentWidgetMessage,
  AgentWidgetStorageAdapter,
  AgentWidgetStoredState
} from "../types";

const safeJsonParse = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    if (typeof console !== "undefined") {
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
        const payload: AgentWidgetStoredState = {
          ...state,
          messages: state.messages ? sanitizeMessages(state.messages) : undefined
        };
        storage.setItem(key, JSON.stringify(payload));
      } catch (error) {
        if (typeof console !== "undefined") {
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
          console.error("[AgentWidget] Failed to clear stored state:", error);
        }
      }
    }
  };
};

