import { describe, it, expect } from "vitest";
import { resolveArtifactDisplayMode } from "./artifact-display";

describe("resolveArtifactDisplayMode", () => {
  it("returns 'panel' when the feature is undefined", () => {
    expect(resolveArtifactDisplayMode(undefined, "markdown")).toBe("panel");
  });

  it("returns 'panel' when display is unset", () => {
    expect(resolveArtifactDisplayMode({ enabled: true }, "markdown")).toBe("panel");
  });

  it("returns the string form directly", () => {
    expect(resolveArtifactDisplayMode({ display: "inline" }, "markdown")).toBe("inline");
    expect(resolveArtifactDisplayMode({ display: "card" }, "component")).toBe("card");
  });

  it("uses the object default when no byType entry matches", () => {
    expect(resolveArtifactDisplayMode({ display: { default: "card" } }, "markdown")).toBe("card");
  });

  it("prefers a byType override over the default", () => {
    const feature = {
      display: { default: "panel" as const, byType: { markdown: "inline" as const } }
    };
    expect(resolveArtifactDisplayMode(feature, "markdown")).toBe("inline");
  });

  it("falls back to the default on a byType miss", () => {
    const feature = {
      display: { default: "card" as const, byType: { markdown: "inline" as const } }
    };
    expect(resolveArtifactDisplayMode(feature, "component")).toBe("card");
  });

  it("returns 'panel' for an object with neither default nor a matching byType", () => {
    expect(resolveArtifactDisplayMode({ display: {} }, "markdown")).toBe("panel");
    expect(
      resolveArtifactDisplayMode({ display: { byType: { component: "inline" } } }, "markdown")
    ).toBe("panel");
  });
});
