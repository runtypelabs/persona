import { describe, expect, it } from "vitest";

import { COMPONENTS_SECTIONS, CONFIGURE_SECTIONS, INTERFACE_ROLES_SECTION } from "./sections";
import { ALL_ROLES } from "./role-mappings";

describe("theme editor scroll-to-bottom controls", () => {
  it("exposes scroll-to-bottom config controls", () => {
    const featureSection = CONFIGURE_SECTIONS.find((section) => section.id === "features");

    expect(featureSection?.fields.some((field) => field.path === "features.scrollToBottom.enabled")).toBe(true);
    expect(featureSection?.fields.some((field) => field.path === "features.scrollToBottom.iconName")).toBe(true);
    expect(featureSection?.fields.some((field) => field.path === "features.scrollToBottom.label")).toBe(true);
  });

  it("exposes scroll-to-bottom component token controls", () => {
    const fieldPaths = COMPONENTS_SECTIONS.flatMap((section) => section.fields.map((field) => field.path));

    expect(fieldPaths).toContain("theme.components.scrollToBottom.background");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.foreground");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.border");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.size");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.borderRadius");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.shadow");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.padding");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.gap");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.fontSize");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.iconSize");
  });

  it("adds a scroll-to-bottom interface role mapping", () => {
    const role = ALL_ROLES.find((entry) => entry.roleId === "role-scroll-to-bottom");

    expect(role).toBeDefined();
    expect(role?.targets.map((target) => target.path)).toEqual(
      expect.arrayContaining([
        "components.scrollToBottom.background",
        "components.scrollToBottom.foreground",
        "components.scrollToBottom.border",
      ])
    );
    expect(INTERFACE_ROLES_SECTION.fields.some((field) => field.id === "role-scroll-to-bottom")).toBe(true);
  });

  it("exposes grouped and collapsed tool call preview controls", () => {
    const debugSection = CONFIGURE_SECTIONS.find((section) => section.id === "debug-inspection");

    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.collapsedMode")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.activePreview")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.previewMaxLines")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.activeMinHeight")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.grouped")).toBe(true);
  });

  it("exposes collapsed reasoning preview controls", () => {
    const debugSection = CONFIGURE_SECTIONS.find((section) => section.id === "debug-inspection");

    expect(debugSection?.fields.some((field) => field.path === "features.reasoningDisplay.activePreview")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.reasoningDisplay.previewMaxLines")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.reasoningDisplay.activeMinHeight")).toBe(true);
  });
});
