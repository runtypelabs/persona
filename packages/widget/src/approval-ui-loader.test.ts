import { describe, it, expect, vi } from "vitest";
import {
  loadApprovalUi,
  setApprovalUiLoader,
  type ApprovalUiModule,
} from "./approval-ui-loader";

const fakeModule = {
  createApprovalBubble: vi.fn(),
} as unknown as ApprovalUiModule;

describe("loadApprovalUi", () => {
  it("retries after a rejected load instead of caching the failure forever", async () => {
    const loader = vi
      .fn<() => Promise<ApprovalUiModule>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(fakeModule);
    setApprovalUiLoader(loader);

    // First call surfaces the rejection to the caller.
    await expect(loadApprovalUi()).rejects.toThrow("network");
    // A later call retries (the failed promise was not cached) and resolves.
    await expect(loadApprovalUi()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);

    // Once resolved, the module is cached (no third loader call).
    await expect(loadApprovalUi()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
