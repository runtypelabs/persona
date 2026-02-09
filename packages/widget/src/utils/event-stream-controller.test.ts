import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/**
 * Tests for programmatic controller methods (showEventStream/hideEventStream/isEventStreamVisible).
 * These simulate the controller method logic from ui.ts without requiring full widget DOM setup.
 */
describe("Event Stream Controller Methods", () => {
  it("showEventStream should call toggleEventStreamOn when feature is enabled", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    let eventStreamVisible = false;
    const showEventStreamToggle = true;
    const eventStreamBuffer = { push: vi.fn(), getAll: () => [] }; // mock buffer

    const toggleEventStreamOn = vi.fn(() => {
      eventStreamVisible = true;
      eventBus.emit("eventStream:opened", { timestamp: Date.now() });
    });

    // Simulates controller.showEventStream() logic
    const showEventStream = () => {
      if (!showEventStreamToggle || !eventStreamBuffer) return;
      toggleEventStreamOn();
    };

    const handler = vi.fn();
    eventBus.on("eventStream:opened", handler);

    showEventStream();

    expect(toggleEventStreamOn).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(eventStreamVisible).toBe(true);
  });

  it("showEventStream should no-op when feature is disabled", () => {
    const showEventStreamToggle = false;
    const eventStreamBuffer = { push: vi.fn(), getAll: () => [] };
    const toggleEventStreamOn = vi.fn();

    const showEventStream = () => {
      if (!showEventStreamToggle || !eventStreamBuffer) return;
      toggleEventStreamOn();
    };

    showEventStream();
    expect(toggleEventStreamOn).not.toHaveBeenCalled();
  });

  it("showEventStream should no-op when buffer is null", () => {
    const showEventStreamToggle = true;
    const eventStreamBuffer = null;
    const toggleEventStreamOn = vi.fn();

    const showEventStream = () => {
      if (!showEventStreamToggle || !eventStreamBuffer) return;
      toggleEventStreamOn();
    };

    showEventStream();
    expect(toggleEventStreamOn).not.toHaveBeenCalled();
  });

  it("hideEventStream should call toggleEventStreamOff when visible", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    let eventStreamVisible = true;

    const toggleEventStreamOff = vi.fn(() => {
      eventStreamVisible = false;
      eventBus.emit("eventStream:closed", { timestamp: Date.now() });
    });

    const hideEventStream = () => {
      if (!eventStreamVisible) return;
      toggleEventStreamOff();
    };

    const handler = vi.fn();
    eventBus.on("eventStream:closed", handler);

    hideEventStream();

    expect(toggleEventStreamOff).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(eventStreamVisible).toBe(false);
  });

  it("hideEventStream should no-op when already hidden", () => {
    const eventStreamVisible = false;
    const toggleEventStreamOff = vi.fn();

    const hideEventStream = () => {
      if (!eventStreamVisible) return;
      toggleEventStreamOff();
    };

    hideEventStream();
    expect(toggleEventStreamOff).not.toHaveBeenCalled();
  });

  it("isEventStreamVisible should return current visibility state", () => {
    let eventStreamVisible = false;

    const isEventStreamVisible = () => eventStreamVisible;

    expect(isEventStreamVisible()).toBe(false);

    eventStreamVisible = true;
    expect(isEventStreamVisible()).toBe(true);

    eventStreamVisible = false;
    expect(isEventStreamVisible()).toBe(false);
  });

  it("show then hide should fire both events in sequence", () => {
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();
    let eventStreamVisible = false;
    const showEventStreamToggle = true;
    const eventStreamBuffer = { push: vi.fn() };
    const events: string[] = [];

    const toggleEventStreamOn = () => {
      eventStreamVisible = true;
      eventBus.emit("eventStream:opened", { timestamp: Date.now() });
    };
    const toggleEventStreamOff = () => {
      if (!eventStreamVisible) return;
      eventStreamVisible = false;
      eventBus.emit("eventStream:closed", { timestamp: Date.now() });
    };

    const showEventStream = () => {
      if (!showEventStreamToggle || !eventStreamBuffer) return;
      toggleEventStreamOn();
    };
    const hideEventStream = () => {
      if (!eventStreamVisible) return;
      toggleEventStreamOff();
    };

    eventBus.on("eventStream:opened", () => events.push("opened"));
    eventBus.on("eventStream:closed", () => events.push("closed"));

    showEventStream();
    hideEventStream();

    expect(events).toEqual(["opened", "closed"]);
    expect(eventStreamVisible).toBe(false);
  });
});

/** Listener type compatible with EventTarget in Node test env (no DOM globals). */
type EventListenerLike = ((event: Event) => void) | { handleEvent(event: Event): void };

/**
 * Minimal EventTarget-based mock for window with CustomEvent support.
 * Used because the test environment is Node.js (no browser globals).
 */
class MockWindow {
  private target = new EventTarget();
  addEventListener(type: string, listener: EventListenerLike) {
    this.target.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: EventListenerLike) {
    this.target.removeEventListener(type, listener);
  }
  dispatchEvent(event: Event): boolean {
    return this.target.dispatchEvent(event);
  }
}

/**
 * Tests for instance-scoped window events (persona:showEventStream / persona:hideEventStream).
 * These verify the CustomEvent dispatching and instance ID filtering logic from ui.ts.
 */
describe("Event Stream Window Events", () => {
  let mockWindow: MockWindow;
  let cleanupFns: (() => void)[];

  beforeEach(() => {
    mockWindow = new MockWindow();
    cleanupFns = [];
  });

  afterEach(() => {
    cleanupFns.forEach(fn => fn());
  });

  /**
   * Creates a mock controller with event stream window event listeners,
   * mirroring the logic in ui.ts lines 3930-3950.
   */
  function createMockWidgetInstance(mountId: string, featureEnabled = true) {
    let eventStreamVisible = false;
    const eventBus = createEventBus<AgentWidgetControllerEventMap>();

    const controller = {
      showEventStream: vi.fn(() => {
        if (!featureEnabled) return;
        eventStreamVisible = true;
        eventBus.emit("eventStream:opened", { timestamp: Date.now() });
      }),
      hideEventStream: vi.fn(() => {
        if (!eventStreamVisible) return;
        eventStreamVisible = false;
        eventBus.emit("eventStream:closed", { timestamp: Date.now() });
      }),
      isEventStreamVisible: () => eventStreamVisible,
      on: eventBus.on.bind(eventBus),
    };

    // Mirror the window event registration logic from ui.ts
    if (featureEnabled) {
      const instanceId = mountId || "persona-" + Math.random().toString(36).slice(2, 8);
      const handleShowEvent = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail?.instanceId || detail.instanceId === instanceId) {
          controller.showEventStream();
        }
      };
      const handleHideEvent = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail?.instanceId || detail.instanceId === instanceId) {
          controller.hideEventStream();
        }
      };
      mockWindow.addEventListener("persona:showEventStream", handleShowEvent);
      mockWindow.addEventListener("persona:hideEventStream", handleHideEvent);
      cleanupFns.push(() => {
        mockWindow.removeEventListener("persona:showEventStream", handleShowEvent);
        mockWindow.removeEventListener("persona:hideEventStream", handleHideEvent);
      });
    }

    return controller;
  }

  it("should open event stream via window event without instanceId", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));

    expect(ctrl.showEventStream).toHaveBeenCalledOnce();
    expect(ctrl.isEventStreamVisible()).toBe(true);
  });

  it("should close event stream via window event without instanceId", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    // First open it
    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));
    expect(ctrl.isEventStreamVisible()).toBe(true);

    // Then close it
    mockWindow.dispatchEvent(new CustomEvent("persona:hideEventStream"));
    expect(ctrl.hideEventStream).toHaveBeenCalledOnce();
    expect(ctrl.isEventStreamVisible()).toBe(false);
  });

  it("should respond to matching instanceId", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream", {
      detail: { instanceId: "persona-root" }
    }));

    expect(ctrl.showEventStream).toHaveBeenCalledOnce();
    expect(ctrl.isEventStreamVisible()).toBe(true);
  });

  it("should NOT respond to non-matching instanceId", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream", {
      detail: { instanceId: "wrong-id" }
    }));

    expect(ctrl.showEventStream).not.toHaveBeenCalled();
    expect(ctrl.isEventStreamVisible()).toBe(false);
  });

  it("should scope events to correct instance with multiple widgets", () => {
    const ctrl1 = createMockWidgetInstance("widget-1");
    const ctrl2 = createMockWidgetInstance("widget-2");

    // Target only widget-1
    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream", {
      detail: { instanceId: "widget-1" }
    }));

    expect(ctrl1.showEventStream).toHaveBeenCalledOnce();
    expect(ctrl2.showEventStream).not.toHaveBeenCalled();
    expect(ctrl1.isEventStreamVisible()).toBe(true);
    expect(ctrl2.isEventStreamVisible()).toBe(false);
  });

  it("should broadcast to all instances when no instanceId is provided", () => {
    const ctrl1 = createMockWidgetInstance("widget-1");
    const ctrl2 = createMockWidgetInstance("widget-2");

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));

    expect(ctrl1.showEventStream).toHaveBeenCalledOnce();
    expect(ctrl2.showEventStream).toHaveBeenCalledOnce();
    expect(ctrl1.isEventStreamVisible()).toBe(true);
    expect(ctrl2.isEventStreamVisible()).toBe(true);
  });

  it("should not register listeners when feature is disabled", () => {
    const ctrl = createMockWidgetInstance("persona-root", false);

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));

    expect(ctrl.showEventStream).not.toHaveBeenCalled();
    expect(ctrl.isEventStreamVisible()).toBe(false);
  });

  it("should clean up window listeners on destroy", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    // Verify it works before cleanup
    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));
    expect(ctrl.showEventStream).toHaveBeenCalledOnce();

    // Simulate destroy by running cleanup
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];

    // Reset mock and dispatch again
    ctrl.showEventStream.mockClear();
    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));
    expect(ctrl.showEventStream).not.toHaveBeenCalled();
  });

  it("should fire eventStream:opened event via controller.on when opened via window event", () => {
    const ctrl = createMockWidgetInstance("persona-root");
    const handler = vi.fn();
    ctrl.on("eventStream:opened", handler);

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ timestamp: expect.any(Number) }));
  });

  it("should fire eventStream:closed event via controller.on when closed via window event", () => {
    const ctrl = createMockWidgetInstance("persona-root");
    const closedHandler = vi.fn();
    ctrl.on("eventStream:closed", closedHandler);

    // Open first, then close
    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream"));
    mockWindow.dispatchEvent(new CustomEvent("persona:hideEventStream"));

    expect(closedHandler).toHaveBeenCalledOnce();
    expect(closedHandler).toHaveBeenCalledWith(expect.objectContaining({ timestamp: expect.any(Number) }));
  });

  it("should handle detail being null gracefully (broadcast)", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream", { detail: null }));

    expect(ctrl.showEventStream).toHaveBeenCalledOnce();
  });

  it("should handle detail with empty object gracefully (broadcast)", () => {
    const ctrl = createMockWidgetInstance("persona-root");

    mockWindow.dispatchEvent(new CustomEvent("persona:showEventStream", { detail: {} }));

    expect(ctrl.showEventStream).toHaveBeenCalledOnce();
  });
});
