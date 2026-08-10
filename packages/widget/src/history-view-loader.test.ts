import { describe, it, expect, vi } from "vitest";
import {
  loadHistoryView,
  setHistoryViewLoader,
  type HistoryViewModule,
} from "./history-view-loader";

const fakeModule = {
  createHistoryView: vi.fn(),
} as unknown as HistoryViewModule;

describe("loadHistoryView", () => {
  it("retries after a rejected load instead of caching the failure forever", async () => {
    const loader = vi
      .fn<() => Promise<HistoryViewModule>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(fakeModule);
    setHistoryViewLoader(loader);

    // First call surfaces the rejection to the caller.
    await expect(loadHistoryView()).rejects.toThrow("network");
    // A later call retries (the failed promise was not cached) and resolves.
    await expect(loadHistoryView()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);

    // Once resolved, the module is cached (no third loader call).
    await expect(loadHistoryView()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
