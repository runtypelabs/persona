import { describe, it, expect, vi } from "vitest";
import { createChunkLoader } from "./chunk-loader";

type FakeModule = { value: number };

describe("createChunkLoader", () => {
  it("uses the fallback import when no loader is registered", async () => {
    const mod: FakeModule = { value: 1 };
    const fallbackImport = vi.fn(async () => mod);
    const { load } = createChunkLoader<FakeModule>({ fallbackImport });

    await expect(load()).resolves.toBe(mod);
    expect(fallbackImport).toHaveBeenCalledTimes(1);
  });

  it("memoizes the resolved module and shares the in-flight promise", async () => {
    const mod: FakeModule = { value: 2 };
    const loader = vi.fn(async () => mod);
    const { setLoader, load } = createChunkLoader<FakeModule>({
      fallbackImport: async () => ({ value: -1 }),
    });
    setLoader(loader);

    // Concurrent callers share one import.
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(mod);
    expect(b).toBe(mod);
    // A later call returns the cached module without importing again.
    await expect(load()).resolves.toBe(mod);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("retries after a rejected load instead of caching the failure", async () => {
    const mod: FakeModule = { value: 3 };
    const loader = vi
      .fn<() => Promise<FakeModule>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(mod);
    const { setLoader, load } = createChunkLoader<FakeModule>({
      fallbackImport: async () => ({ value: -1 }),
    });
    setLoader(loader);

    await expect(load()).rejects.toThrow("network");
    // The failed promise was cleared, so a later call retries and resolves.
    await expect(load()).resolves.toBe(mod);
    expect(loader).toHaveBeenCalledTimes(2);
    // Once resolved, the module is cached (no third loader call).
    await expect(load()).resolves.toBe(mod);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not invalidate the cache on setLoader by default", async () => {
    const first: FakeModule = { value: 4 };
    const second: FakeModule = { value: 5 };
    const { setLoader, load } = createChunkLoader<FakeModule>({
      fallbackImport: async () => ({ value: -1 }),
    });

    setLoader(async () => first);
    await expect(load()).resolves.toBe(first);
    // Registering a new loader after a resolved load has no effect: cache holds.
    setLoader(async () => second);
    await expect(load()).resolves.toBe(first);
  });

  it("invalidates the cache on setLoader when resetOnSetLoader is set", async () => {
    const first: FakeModule = { value: 6 };
    const second: FakeModule = { value: 7 };
    const { setLoader, load } = createChunkLoader<FakeModule>({
      fallbackImport: async () => ({ value: -1 }),
      resetOnSetLoader: true,
    });

    setLoader(async () => first);
    await expect(load()).resolves.toBe(first);
    // A swapped loader takes effect: the previous module is discarded.
    setLoader(async () => second);
    await expect(load()).resolves.toBe(second);
  });

  it("provide() seeds the cache and getSync() reads it", async () => {
    const mod: FakeModule = { value: 8 };
    const loader = vi.fn(async () => ({ value: -1 }));
    const { setLoader, load, provide, getSync } = createChunkLoader<FakeModule>({
      fallbackImport: async () => ({ value: -1 }),
    });
    setLoader(loader);

    expect(getSync()).toBeNull();
    provide(mod);
    expect(getSync()).toBe(mod);
    // A provided module short-circuits load(): the loader is never called.
    await expect(load()).resolves.toBe(mod);
    expect(loader).not.toHaveBeenCalled();
  });
});
