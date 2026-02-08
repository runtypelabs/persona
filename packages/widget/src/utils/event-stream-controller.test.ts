import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "./events";
import type { AgentWidgetControllerEventMap } from "../types";

describe("Event Stream Controller Events", () => {
  it("should emit eventStream:opened with timestamp", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    const handler = vi.fn();
    eventBus.on("eventStream:opened", handler);

    const now = Date.now();
    eventBus.emit("eventStream:opened", { timestamp: now });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ timestamp: now });
  });

  it("should emit eventStream:closed with timestamp", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    const handler = vi.fn();
    eventBus.on("eventStream:closed", handler);

    const now = Date.now();
    eventBus.emit("eventStream:closed", { timestamp: now });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ timestamp: now });
  });

  it("should allow unsubscription from eventStream events", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    const handler = vi.fn();
    const unsub = eventBus.on("eventStream:opened", handler);

    eventBus.emit("eventStream:opened", { timestamp: Date.now() });
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    eventBus.emit("eventStream:opened", { timestamp: Date.now() });
    expect(handler).toHaveBeenCalledOnce(); // still 1 - not called again
  });

  it("should not interfere with other controller events", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    const openedHandler = vi.fn();
    const closedHandler = vi.fn();
    const widgetOpenedHandler = vi.fn();

    eventBus.on("eventStream:opened", openedHandler);
    eventBus.on("eventStream:closed", closedHandler);
    eventBus.on("widget:opened", widgetOpenedHandler);

    eventBus.emit("eventStream:opened", { timestamp: Date.now() });

    expect(openedHandler).toHaveBeenCalledOnce();
    expect(closedHandler).not.toHaveBeenCalled();
    expect(widgetOpenedHandler).not.toHaveBeenCalled();
  });

  it("should support multiple listeners for the same event", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.on("eventStream:opened", handler1);
    eventBus.on("eventStream:opened", handler2);

    const now = Date.now();
    eventBus.emit("eventStream:opened", { timestamp: now });

    expect(handler1).toHaveBeenCalledWith({ timestamp: now });
    expect(handler2).toHaveBeenCalledWith({ timestamp: now });
  });
});
