import { expect, it, vi } from "vitest";
import { mergeWithDefaults } from "../defaults";

it("preserves authored style provenance across separately loaded module copies", async () => {
  const inherited = mergeWithDefaults({ future: { v5Defaults: true } });
  const explicit = mergeWithDefaults({ approval: { backgroundColor: "#123456" } });
  vi.resetModules();
  const { getExplicitLegacyStyle, hasStyleProvenance } = await import("./style-provenance");
  expect(hasStyleProvenance(inherited)).toBe(true);
  expect(getExplicitLegacyStyle(inherited, "approval.backgroundColor")).toBeUndefined();
  expect(getExplicitLegacyStyle(explicit, "approval.backgroundColor")).toBe("#123456");
});
