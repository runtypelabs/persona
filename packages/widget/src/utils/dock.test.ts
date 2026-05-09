import { describe, expect, it } from "vitest";
import { isComposerBarMountMode, isDockedMountMode } from "./dock";
import type { AgentWidgetConfig } from "../types";

describe("isDockedMountMode", () => {
  it("returns true for mountMode: 'docked'", () => {
    const config: AgentWidgetConfig = { apiUrl: "/api", launcher: { mountMode: "docked" } };
    expect(isDockedMountMode(config)).toBe(true);
  });

  it("returns false for default and other mount modes", () => {
    expect(isDockedMountMode(undefined)).toBe(false);
    expect(isDockedMountMode({ apiUrl: "/api" } as AgentWidgetConfig)).toBe(false);
    expect(
      isDockedMountMode({ apiUrl: "/api", launcher: { mountMode: "composer-bar" } } as AgentWidgetConfig)
    ).toBe(false);
  });
});

describe("isComposerBarMountMode", () => {
  it("returns true for mountMode: 'composer-bar'", () => {
    const config: AgentWidgetConfig = {
      apiUrl: "/api",
      launcher: { mountMode: "composer-bar" },
    };
    expect(isComposerBarMountMode(config)).toBe(true);
  });

  it("returns false for default, floating, and docked modes", () => {
    expect(isComposerBarMountMode(undefined)).toBe(false);
    expect(isComposerBarMountMode({ apiUrl: "/api" } as AgentWidgetConfig)).toBe(false);
    expect(
      isComposerBarMountMode({
        apiUrl: "/api",
        launcher: { mountMode: "floating" },
      } as AgentWidgetConfig)
    ).toBe(false);
    expect(
      isComposerBarMountMode({
        apiUrl: "/api",
        launcher: { mountMode: "docked" },
      } as AgentWidgetConfig)
    ).toBe(false);
  });
});
