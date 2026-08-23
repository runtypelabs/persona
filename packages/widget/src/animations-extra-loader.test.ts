import { describe, it, expect, vi } from "vitest";
import {
  loadAnimationsExtra,
  setAnimationsExtraLoader,
  type AnimationsExtraModule,
} from "./animations-extra-loader";

const fakeModule = {
  wipe: { name: "wipe" },
  glyphCycle: { name: "glyph-cycle" },
} as unknown as AnimationsExtraModule;

describe("loadAnimationsExtra", () => {
  it("retries after a rejected load instead of caching the failure forever", async () => {
    const loader = vi
      .fn<() => Promise<AnimationsExtraModule>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(fakeModule);
    setAnimationsExtraLoader(loader);

    // First call surfaces the rejection to the caller.
    await expect(loadAnimationsExtra()).rejects.toThrow("network");
    // A later call retries (the failed promise was not cached) and resolves.
    await expect(loadAnimationsExtra()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);

    // Once resolved, the module is cached (no third loader call).
    await expect(loadAnimationsExtra()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
