import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./events";

describe("event listener context", () => {
  it("preserves payload identity and scopes context to the bus", () => {
    const first = createEventBus<{ change: object }>({ instanceId: "first" });
    const second = createEventBus<{ change: object }>({ instanceId: "second" });
    const listener = vi.fn();
    const payload = {};
    first.on("change", listener);
    second.on("change", listener);
    first.emit("change", payload);
    second.emit("change", payload);
    expect(listener.mock.calls).toEqual([[payload, { instanceId: "first" }], [payload, { instanceId: "second" }]]);
    expect(listener.mock.calls[0][0]).toBe(payload);
  });

  it("releases existing and refuses new listeners after disposal", () => {
    const bus = createEventBus<{ change: string }>({ instanceId: "first" });
    const listener = vi.fn();
    const unsubscribe = bus.on("change", listener);
    bus.dispose();
    unsubscribe();
    bus.on("change", listener);
    bus.emit("change", "late");
    expect(listener).not.toHaveBeenCalled();
  });
});
