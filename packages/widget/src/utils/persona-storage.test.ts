// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  createIndexedDBDriver,
  createLocalStorageDriver,
  createMemoryDriver,
  createStorage,
  prefixStorage
} from "./persona-storage";

describe("memory driver", () => {
  it("round-trips values and lists keys", async () => {
    const storage = createStorage({ driver: createMemoryDriver() });
    await storage.setItem("a", { hello: "world" });
    await storage.setItem("b", 42);

    expect(await storage.getItem("a")).toEqual({ hello: "world" });
    expect(await storage.getItem("b")).toBe(42);
    expect((await storage.getKeys()).sort()).toEqual(["a", "b"]);
    expect(await storage.hasItem("a")).toBe(true);
    expect(await storage.hasItem("missing")).toBe(false);
  });

  it("clears by prefix", async () => {
    const storage = createStorage({ driver: createMemoryDriver() });
    await storage.setItem("user:1", "alice");
    await storage.setItem("user:2", "bob");
    await storage.setItem("session:x", "keep");
    await storage.clear("user:");

    expect(await storage.getKeys()).toEqual(["session:x"]);
  });

  it("emits watch events on update and remove", async () => {
    const storage = createStorage({ driver: createMemoryDriver() });
    const events: Array<[string, string]> = [];
    const unwatch = storage.watch((event, key) => events.push([event, key]));

    await storage.setItem("foo", 1);
    await storage.removeItem("foo");
    unwatch();
    await storage.setItem("ignored", 2);

    expect(events).toEqual([
      ["update", "foo"],
      ["remove", "foo"]
    ]);
  });

  it("snapshot and restore round-trip", async () => {
    const a = createStorage({ driver: createMemoryDriver() });
    await a.setItem("k1", { n: 1 });
    await a.setItem("k2", "two");

    const b = createStorage({ driver: createMemoryDriver() });
    await b.restore(await a.snapshot());

    expect(await b.getItem("k1")).toEqual({ n: 1 });
    expect(await b.getItem("k2")).toBe("two");
  });
});

describe("prefixStorage", () => {
  it("transparently scopes operations", async () => {
    const root = createStorage({ driver: createMemoryDriver() });
    const scoped = prefixStorage(root, "conv:abc:");

    await scoped.setItem("messages", [1, 2, 3]);
    expect(await scoped.getItem("messages")).toEqual([1, 2, 3]);
    expect(await root.getItem("conv:abc:messages")).toEqual([1, 2, 3]);
    expect(await scoped.getKeys()).toEqual(["messages"]);

    await scoped.clear();
    expect(await root.getKeys()).toEqual([]);
  });

  it("filters watch events to the scope", async () => {
    const root = createStorage({ driver: createMemoryDriver() });
    const scoped = prefixStorage(root, "x:");
    const events: string[] = [];
    scoped.watch((_event, key) => events.push(key));

    await root.setItem("x:hit", 1);
    await root.setItem("y:miss", 2);

    expect(events).toEqual(["hit"]);
  });
});

describe("localStorage driver", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists through the underlying Storage", async () => {
    const storage = createStorage({ driver: createLocalStorageDriver() });
    await storage.setItem("k", { a: 1 });

    expect(window.localStorage.getItem("k")).toBe('{"a":1}');
    expect(await storage.getItem("k")).toEqual({ a: 1 });
  });

  it("isolates keys by configured prefix", async () => {
    const storage = createStorage({
      driver: createLocalStorageDriver({ prefix: "persona:" })
    });
    window.localStorage.setItem("unrelated", "ignore-me");
    await storage.setItem("foo", "bar");

    expect(window.localStorage.getItem("persona:foo")).toBe('"bar"');
    expect(await storage.getKeys()).toEqual(["foo"]);

    await storage.clear();
    expect(window.localStorage.getItem("unrelated")).toBe("ignore-me");
  });
});

describe("createStorageAdapter", () => {
  it("bridges PersonaStorage to AgentWidgetStorageAdapter", async () => {
    const { createStorageAdapter } = await import("./storage");
    const storage = createStorage({ driver: createMemoryDriver() });
    const adapter = createStorageAdapter(storage, "persona-state");

    await adapter.save?.({
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "hi",
          streaming: true
        } as unknown as never
      ],
      metadata: { foo: "bar" }
    });

    const loaded = await adapter.load?.();
    expect(loaded?.metadata).toEqual({ foo: "bar" });
    // streaming=true is sanitized to false on persist
    expect(loaded?.messages?.[0]).toMatchObject({ streaming: false });

    await adapter.clear?.();
    expect(await adapter.load?.()).toBeNull();
  });

  it("sanitizes artifact status to complete", async () => {
    const { createStorageAdapter } = await import("./storage");
    const storage = createStorage({ driver: createMemoryDriver() });
    const adapter = createStorageAdapter(storage, "k");

    await adapter.save?.({
      artifacts: [
        { id: "a", status: "streaming" } as unknown as never
      ]
    });
    const loaded = await adapter.load?.();
    expect(loaded?.artifacts?.[0]).toMatchObject({ status: "complete" });
  });
});

describe("indexedDB driver", () => {
  let dbCounter = 0;
  const freshDb = () => `persona-storage-test-${Date.now()}-${dbCounter++}`;

  it("round-trips JSON values", async () => {
    const storage = createStorage({
      driver: createIndexedDBDriver({ dbName: freshDb() })
    });
    await storage.setItem("alpha", { value: 1 });
    await storage.setItem("beta", "hello");

    expect(await storage.getItem("alpha")).toEqual({ value: 1 });
    expect(await storage.getItem("beta")).toBe("hello");
    expect((await storage.getKeys()).sort()).toEqual(["alpha", "beta"]);
  });

  it("removes individual keys", async () => {
    const storage = createStorage({
      driver: createIndexedDBDriver({ dbName: freshDb() })
    });
    await storage.setItem("keep", 1);
    await storage.setItem("drop", 2);
    await storage.removeItem("drop");

    expect(await storage.hasItem("drop")).toBe(false);
    expect(await storage.getItem("keep")).toBe(1);
  });

  it("clears entries by prefix", async () => {
    const storage = createStorage({
      driver: createIndexedDBDriver({ dbName: freshDb() })
    });
    await storage.setItem("ev:1", "a");
    await storage.setItem("ev:2", "b");
    await storage.setItem("meta:x", "keep");
    await storage.clear("ev:");

    expect((await storage.getKeys()).sort()).toEqual(["meta:x"]);
  });

  it("isolates writes by configured prefix", async () => {
    const dbName = freshDb();
    const scoped = createStorage({
      driver: createIndexedDBDriver({ dbName, prefix: "session:" })
    });
    const raw = createStorage({ driver: createIndexedDBDriver({ dbName }) });

    await scoped.setItem("a", 1);
    expect(await scoped.getKeys()).toEqual(["a"]);
    expect((await raw.getKeys()).sort()).toEqual(["session:a"]);
  });

  it("snapshot and restore round-trip across drivers", async () => {
    const source = createStorage({
      driver: createIndexedDBDriver({ dbName: freshDb() })
    });
    await source.setItem("k1", { n: 1 });
    await source.setItem("k2", "two");

    const target = createStorage({ driver: createMemoryDriver() });
    await target.restore(await source.snapshot());

    expect(await target.getItem("k1")).toEqual({ n: 1 });
    expect(await target.getItem("k2")).toBe("two");
  });
});
