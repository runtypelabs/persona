import { describe, it, expect } from "vitest";
import { EventStreamBuffer } from "./event-stream-buffer";
import type { SSEEventRecord } from "../types";

function makeEvent(type: string, index: number): SSEEventRecord {
  return {
    id: `evt-${index}`,
    type,
    timestamp: 1000 + index,
    payload: JSON.stringify({ index })
  };
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
});
