// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
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
