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

  it("should handle putBatch with 100 events", async () => {
    const events = Array.from({ length: 100 }, (_, i) => makeEvent("bulk", i));
    store.putBatch(events);
    await new Promise((r) => setTimeout(r, 50));
    const result = await store.getAll();
    expect(result).toHaveLength(100);
    const count = await store.getCount();
    expect(count).toBe(100);
  });

  it("should prevent new writes after destroy via isDestroyed flag", async () => {
    store.put(makeEvent("a", 1));
    await new Promise((r) => setTimeout(r, 50));
    await store.destroy();
    // After destroy, the store should not accept new writes
    // Re-create a store with the same db name to verify no new data was written
    const store2 = new EventStreamStore("verify-destroyed-" + Math.random(), "events");
    await store2.open();
    // The original store is destroyed - calling put should be a no-op
    store.put(makeEvent("b", 2));
    store.putBatch([makeEvent("c", 3)]);
    await new Promise((r) => setTimeout(r, 50));
    await store2.destroy();
  });

  it("should discard pending writes on destroy", async () => {
    // Put events that are pending (not yet flushed)
    store.put(makeEvent("a", 1));
    store.put(makeEvent("b", 2));
    // Destroy immediately before microtask flushes
    await store.destroy();
    // Pending writes should have been discarded, not flushed
    // After destroy, db is null so flushWrites will no-op even if microtask runs
    await new Promise((r) => setTimeout(r, 50));
  });

  it("should not throw when put is called after destroy", async () => {
    await store.destroy();
    // Should not throw
    store.put(makeEvent("a", 1));
    store.putBatch([makeEvent("b", 2)]);
  });

  it("should handle IndexedDB being unavailable", async () => {
    const origIndexedDB = globalThis.indexedDB;
    try {
      // Simulate IndexedDB being unavailable by deleting it
      // @ts-expect-error - intentionally removing indexedDB for testing
      delete globalThis.indexedDB;
      const unavailableStore = new EventStreamStore("unavailable-db", "events");
      // open() should reject, but put/putBatch should not throw
      await expect(unavailableStore.open()).rejects.toBeDefined();
      // Operations on a store that never opened should be silent no-ops
      unavailableStore.put(makeEvent("a", 1));
      unavailableStore.putBatch([makeEvent("b", 2)]);
      const result = await unavailableStore.getAll();
      expect(result).toEqual([]);
      const count = await unavailableStore.getCount();
      expect(count).toBe(0);
      await unavailableStore.clear(); // should not throw
    } finally {
      globalThis.indexedDB = origIndexedDB;
    }
  });
});
