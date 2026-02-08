import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { EventStreamStore } from "./event-stream-store";
import type { SSEEventRecord } from "../types";

function makeEvent(type: string, index: number): SSEEventRecord {
  return {
    id: `evt-${index}`,
    type,
    timestamp: 1000 + index,
    payload: JSON.stringify({ index })
  };
}

describe("EventStreamStore", () => {
  let store: EventStreamStore;

  beforeEach(async () => {
    store = new EventStreamStore("test-db-" + Math.random(), "events");
    await store.open();
  });

  afterEach(async () => {
    await store.destroy();
  });

  it("should open and close without error", () => {
    expect(store).toBeDefined();
  });

  it("should store and retrieve events via putBatch + getAll", async () => {
    const events = [makeEvent("a", 1), makeEvent("b", 2), makeEvent("c", 3)];
    store.putBatch(events);
    // Wait for transaction to complete
    await new Promise((r) => setTimeout(r, 50));
    const result = await store.getAll();
    expect(result).toEqual(events);
  });

  it("should return events ordered by timestamp", async () => {
    const events = [makeEvent("a", 3), makeEvent("b", 1), makeEvent("c", 2)];
    store.putBatch(events);
    await new Promise((r) => setTimeout(r, 50));
    const result = await store.getAll();
    expect(result.map((e) => e.timestamp)).toEqual([1001, 1002, 1003]);
  });

  it("should write events via put with microtask batching", async () => {
    store.put(makeEvent("a", 1));
    store.put(makeEvent("b", 2));
    store.put(makeEvent("c", 3));
    // Wait for microtask flush + transaction
    await new Promise((r) => setTimeout(r, 50));
    const result = await store.getAll();
    expect(result).toHaveLength(3);
  });

  it("should return count of stored events", async () => {
    store.putBatch([makeEvent("a", 1), makeEvent("b", 2)]);
    await new Promise((r) => setTimeout(r, 50));
    const count = await store.getCount();
    expect(count).toBe(2);
  });

  it("should clear all events", async () => {
    store.putBatch([makeEvent("a", 1), makeEvent("b", 2)]);
    await new Promise((r) => setTimeout(r, 50));
    await store.clear();
    const result = await store.getAll();
    expect(result).toEqual([]);
    const count = await store.getCount();
    expect(count).toBe(0);
  });

  it("should return empty array when no events stored", async () => {
    const result = await store.getAll();
    expect(result).toEqual([]);
  });

  it("should return 0 count when no events stored", async () => {
    const count = await store.getCount();
    expect(count).toBe(0);
  });

  it("should destroy the database", async () => {
    store.putBatch([makeEvent("a", 1)]);
    await new Promise((r) => setTimeout(r, 50));
    await store.destroy();
    // After destroy, getAll should return empty (db is null)
    const result = await store.getAll();
    expect(result).toEqual([]);
  });

  it("should handle put gracefully when db is not open", () => {
    const closedStore = new EventStreamStore("closed-db", "events");
    // Should not throw
    closedStore.put(makeEvent("a", 1));
  });

  it("should handle putBatch gracefully when db is not open", () => {
    const closedStore = new EventStreamStore("closed-db", "events");
    // Should not throw
    closedStore.putBatch([makeEvent("a", 1)]);
  });

  it("should clear pending writes on clear", async () => {
    // Put some events that are still pending
    store.put(makeEvent("a", 1));
    // Clear before microtask flushes
    await store.clear();
    // Wait for microtask
    await new Promise((r) => setTimeout(r, 50));
    const result = await store.getAll();
    expect(result).toEqual([]);
  });
});
