import { describe, it, expect, vi } from "vitest";
import {
  loadContextMentionsInline,
  setContextMentionsInlineLoader,
  type ContextMentionsInlineModule,
} from "./context-mentions-inline-loader";

const fakeModule = {
  mountInlineComposer: vi.fn(),
} as unknown as ContextMentionsInlineModule;

describe("loadContextMentionsInline", () => {
  it("retries after a rejected load instead of caching the failure forever", async () => {
    const loader = vi
      .fn<() => Promise<ContextMentionsInlineModule>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(fakeModule);
    setContextMentionsInlineLoader(loader);

    // First call surfaces the rejection to the caller.
    await expect(loadContextMentionsInline()).rejects.toThrow("network");
    // A later call retries (the failed promise was not cached) and resolves.
    await expect(loadContextMentionsInline()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);

    // Once resolved, the module is cached (no third loader call).
    await expect(loadContextMentionsInline()).resolves.toBe(fakeModule);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
