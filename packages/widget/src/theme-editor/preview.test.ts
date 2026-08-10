import { describe, expect, it } from "vitest";
import { normalizePreviewDevice, normalizePreviewShellMode } from "./preview";

describe("theme preview runtime normalization", () => {
  it("reduces caller-controlled attribute values to known constants", () => {
    expect(normalizePreviewDevice('mobile" onmouseover="alert(1)' as never)).toBe("desktop");
    expect(normalizePreviewShellMode('dark" onmouseover="alert(1)' as never)).toBe("light");
    expect(normalizePreviewDevice("mobile")).toBe("mobile");
    expect(normalizePreviewShellMode("dark")).toBe("dark");
  });
});
