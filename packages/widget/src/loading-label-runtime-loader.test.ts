import { expect, it, vi } from "vitest";
import type { LoadingLabelRuntime } from "./loading-label-runtime-loader";

it("shares an in-flight animation import, retries rejection, and caches success", async () => {
  vi.resetModules();
  const { setLoadingLabelRuntimeLoader, loadLoadingLabelRuntime, getLoadingLabelRuntimeSync } = await import("./loading-label-runtime-loader");
  const runtime = { applyLoadingLabel: vi.fn(), createLoadingLabelLifecycle: vi.fn(), applyLoadingAnimation: vi.fn() } satisfies LoadingLabelRuntime;
  const fetch = vi.fn<() => Promise<LoadingLabelRuntime>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(runtime);
  setLoadingLabelRuntimeLoader(fetch);
  const first = loadLoadingLabelRuntime();
  expect(loadLoadingLabelRuntime()).toBe(first);
  await expect(first).rejects.toThrow("offline");
  expect(getLoadingLabelRuntimeSync()).toBeNull();
  await expect(loadLoadingLabelRuntime()).resolves.toBe(runtime);
  await expect(loadLoadingLabelRuntime()).resolves.toBe(runtime);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(getLoadingLabelRuntimeSync()).toBe(runtime);
});
