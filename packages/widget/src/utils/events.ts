type Handler<T> = (payload: T) => void;

export type EventUnsubscribe = () => void;

export const createEventBus = <EventMap extends Record<string, any>>() => {
  const listeners = new Map<keyof EventMap, Set<Handler<any>>>();

  const on = <K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>
  ): EventUnsubscribe => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(handler as Handler<any>);
    return () => off(event, handler);
  };

  const off = <K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>
  ) => {
    listeners.get(event)?.delete(handler as Handler<any>);
  };

  const emit = <K extends keyof EventMap>(event: K, payload: EventMap[K]) => {
    listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Event handler error:", error);
        }
      }
    });
  };

  return { on, off, emit };
};

