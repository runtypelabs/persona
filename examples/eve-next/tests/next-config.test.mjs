import { afterEach, expect, it, vi } from "vitest";
import config from "../next.config.mjs";

const eve = vi.hoisted(() => ({ configure: vi.fn(), withEve: vi.fn() }));
vi.mock("eve/next", () => ({ withEve: eve.withEve }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("skips Eve in the default keyless Preview", async () => {
  vi.stubEnv("EVE_MODE", "preview");
  expect(await config("phase-production-build", {})).toEqual({ serverExternalPackages: ["eve"] });
  expect(eve.withEve).not.toHaveBeenCalled();
});
it("invokes withEve's returned config function with Next's phase and context", async () => {
  vi.stubEnv("EVE_MODE", "live");
  vi.stubEnv("EVE_BASE_URL", "");
  eve.configure.mockResolvedValue({ rewrites: "configured" });
  eve.withEve.mockReturnValue(eve.configure);
  const context = { defaultConfig: {} };
  expect(await config("phase-development-server", context)).toEqual({ rewrites: "configured" });
  expect(eve.configure).toHaveBeenCalledWith("phase-development-server", context);
});
it("does not start a second Eve runtime for an external server", async () => {
  vi.stubEnv("EVE_MODE", "live");
  vi.stubEnv("EVE_BASE_URL", "https://agent.example.test");
  await config("phase-development-server", {});
  expect(eve.withEve).not.toHaveBeenCalled();
});
