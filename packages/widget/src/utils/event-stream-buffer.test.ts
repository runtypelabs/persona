import { describe, it, expect, vi } from "vitest";
import { EventStreamBuffer } from "./event-stream-buffer";
import type { EventStreamStore } from "./event-stream-store";
import type { SSEEventRecord } from "../types";

function makeEvent(type: string, index: number): SSEEventRecord {
  return {
    id: `evt-${index}`,
    type,
    timestamp: 1000 + index,
    payload: JSON.stringify({ index })
  };
}

function createMockStore(): EventStreamStore {
  const events: SSEEventRecord[] = [];
  return {
    open: vi.fn().mockResolvedValue(undefined),
    put: vi.fn((event: SSEEventRecord) => { events.push(event); }),
    putBatch: vi.fn((batch: SSEEventRecord[]) => { events.push(...batch); }),
    getAll: vi.fn(() => Promise.resolve([...events])),
    getCount: vi.fn(() => Promise.resolve(events.length)),
    clear: vi.fn(() => { events.length = 0; return Promise.resolve(); }),
    close: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStreamStore;
}

describe("EventStreamBuffer", () => {
  it("should start empty", () => {
    const buf = new EventStreamBuffer(10);
    expect(buf.getSize()).toBe(0);
    expect(buf.getAll()).toEqual([]);
    expect(buf.getTotalCaptured()).toBe(0);
    expect(buf.getEvictedCount()).toBe(0);
  });

  it("should push and retrieve events", () => {
    const buf = new EventStreamBuffer(10);
    const evt = makeEvent("step_chunk", 1);
    buf.push(evt);
    expect(buf.getSize()).toBe(1);
    expect(buf.getAll()).toEqual([evt]);
  });

  it("should return events in chronological order", () => {
    const buf = new EventStreamBuffer(10);
    const events = [makeEvent("a", 1), makeEvent("b", 2), makeEvent("c", 3)];
    for (const e of events) buf.push(e);
    expect(buf.getAll()).toEqual(events);
  });

  it("should evict oldest events when at capacity", () => {
    const buf = new EventStreamBuffer(3);
    const events = [
      makeEvent("a", 1),
      makeEvent("b", 2),
      makeEvent("c", 3),
      makeEvent("d", 4),
      makeEvent("e", 5)
    ];
    for (const e of events) buf.push(e);
    expect(buf.getSize()).toBe(3);
    expect(buf.getAll()).toEqual([events[2], events[3], events[4]]);
    expect(buf.getTotalCaptured()).toBe(5);
    expect(buf.getEvictedCount()).toBe(2);
  });

  it("should return recent events", () => {
    const buf = new EventStreamBuffer(10);
    const events = Array.from({ length: 5 }, (_, i) => makeEvent("x", i));
    for (const e of events) buf.push(e);
    expect(buf.getRecent(2)).toEqual([events[3], events[4]]);
    expect(buf.getRecent(10)).toEqual(events);
  });

  it("should return the N most recent from a large buffer", () => {
    const buf = new EventStreamBuffer(200);
    const events = Array.from({ length: 100 }, (_, i) => makeEvent("x", i));
    for (const e of events) buf.push(e);
    const recent = buf.getRecent(10);
    expect(recent).toHaveLength(10);
    expect(recent).toEqual(events.slice(90));
  });

  it("should track unique event types", () => {
    const buf = new EventStreamBuffer(10);
    buf.push(makeEvent("step_chunk", 1));
    buf.push(makeEvent("flow_complete", 2));
    buf.push(makeEvent("step_chunk", 3));
    const types = buf.getEventTypes();
    expect(types).toContain("step_chunk");
    expect(types).toContain("flow_complete");
    expect(types).toHaveLength(2);
  });

  it("should preserve event types after eviction", () => {
    const buf = new EventStreamBuffer(3);
    buf.push(makeEvent("step_chunk", 1));
    buf.push(makeEvent("tool_start", 2));
    buf.push(makeEvent("flow_complete", 3));
    // Evict the step_chunk event
    buf.push(makeEvent("tool_end", 4));
    buf.push(makeEvent("tool_end", 5));
    // step_chunk is evicted from the buffer but still tracked in types
    const all = buf.getAll();
    expect(all.every(e => e.type !== "step_chunk")).toBe(true);
    const types = buf.getEventTypes();
    expect(types).toContain("step_chunk");
    expect(types).toContain("tool_start");
    expect(types).toContain("flow_complete");
    expect(types).toContain("tool_end");
    expect(types).toHaveLength(4);
  });

  it("should clear the buffer", () => {
    const buf = new EventStreamBuffer(10);
    buf.push(makeEvent("a", 1));
    buf.push(makeEvent("b", 2));
    buf.clear();
    expect(buf.getSize()).toBe(0);
    expect(buf.getAll()).toEqual([]);
    expect(buf.getTotalCaptured()).toBe(0);
    expect(buf.getEventTypes()).toEqual([]);
  });

  it("should handle wrapping correctly with exact capacity", () => {
    const buf = new EventStreamBuffer(3);
    // Fill exactly to capacity
    buf.push(makeEvent("a", 1));
    buf.push(makeEvent("b", 2));
    buf.push(makeEvent("c", 3));
    expect(buf.getAll()).toEqual([
      makeEvent("a", 1),
      makeEvent("b", 2),
      makeEvent("c", 3)
    ]);
    // Overwrite one
    buf.push(makeEvent("d", 4));
    expect(buf.getAll()).toEqual([
      makeEvent("b", 2),
      makeEvent("c", 3),
      makeEvent("d", 4)
    ]);
  });

  it("should use default maxSize of 500", () => {
    const buf = new EventStreamBuffer();
    for (let i = 0; i < 600; i++) {
      buf.push(makeEvent("x", i));
    }
    expect(buf.getSize()).toBe(500);
    expect(buf.getTotalCaptured()).toBe(600);
    expect(buf.getEvictedCount()).toBe(100);
  });

  it("should forward push to store when store is provided", () => {
    const store = createMockStore();
    const buf = new EventStreamBuffer(10, store);
    const evt = makeEvent("a", 1);
    buf.push(evt);
    expect(store.put).toHaveBeenCalledWith(evt);
  });

  it("should not call store when store is null", () => {
    const buf = new EventStreamBuffer(10, null);
    // Should not throw
    buf.push(makeEvent("a", 1));
    buf.clear();
    buf.destroy();
  });

  it("should forward clear to store", () => {
    const store = createMockStore();
    const buf = new EventStreamBuffer(10, store);
    buf.push(makeEvent("a", 1));
    buf.clear();
    expect(store.clear).toHaveBeenCalled();
  });

  it("should forward destroy to store", () => {
    const store = createMockStore();
    const buf = new EventStreamBuffer(10, store);
    buf.destroy();
    expect(store.destroy).toHaveBeenCalled();
  });

  it("should clear internal state on destroy", () => {
    const buf = new EventStreamBuffer(10);
    buf.push(makeEvent("a", 1));
    buf.push(makeEvent("b", 2));
    expect(buf.getSize()).toBe(2);
    buf.destroy();
    expect(buf.getSize()).toBe(0);
    expect(buf.getAll()).toEqual([]);
    expect(buf.getTotalCaptured()).toBe(0);
    expect(buf.getEventTypes()).toEqual([]);
  });

  it("should clear buffer state and chain to store destroy", () => {
    const store = createMockStore();
    const buf = new EventStreamBuffer(10, store);
    buf.push(makeEvent("a", 1));
    buf.push(makeEvent("b", 2));
    buf.destroy();
    expect(buf.getSize()).toBe(0);
    expect(buf.getAll()).toEqual([]);
    expect(store.destroy).toHaveBeenCalled();
  });

  it("should return store events from getAllFromStore when store exists", async () => {
    const store = createMockStore();
    const buf = new EventStreamBuffer(3, store);
    const events = [makeEvent("a", 1), makeEvent("b", 2), makeEvent("c", 3)];
    for (const e of events) buf.push(e);
    const result = await buf.getAllFromStore();
    expect(store.getAll).toHaveBeenCalled();
    expect(result).toEqual(events);
  });

  it("should fall back to ring buffer in getAllFromStore when no store", async () => {
    const buf = new EventStreamBuffer(10, null);
    const events = [makeEvent("a", 1), makeEvent("b", 2)];
    for (const e of events) buf.push(e);
    const result = await buf.getAllFromStore();
    expect(result).toEqual(events);
  });
});
