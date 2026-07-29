import { describe, expect, it } from "vitest";

import { COMPONENTS_SECTIONS, CONFIGURE_SECTIONS, INTERFACE_ROLES_SECTION, STYLE_SECTIONS } from "./sections";
import { ALL_ROLES } from "./role-mappings";

describe("theme editor scroll-to-bottom controls", () => {
  it("exposes clear style semantics and independent role width controls", () => {
    const section = CONFIGURE_SECTIONS.find((entry) => entry.id === "messages-layout");
    const fieldsByPath = new Map(
      section?.fields.map((field) => [field.path, field]) ?? []
    );

    expect(fieldsByPath.get("layout.messages.layout")?.options).toEqual([
      { value: "bubble", label: "Bubble — bubbles for both" },
      { value: "minimal", label: "Minimal — user bubble, open assistant" },
      { value: "flat", label: "Flat — open messages for both" },
    ]);
    expect(fieldsByPath.has("layout.messages.user.style")).toBe(false);
    expect(fieldsByPath.has("layout.messages.assistant.style")).toBe(false);

    expect(fieldsByPath.get("layout.messages.user.width")?.options).toEqual([
      { value: "content", label: "Content" },
      { value: "full", label: "Full" },
    ]);
    expect(fieldsByPath.get("layout.messages.assistant.width")?.options).toEqual([
      { value: "content", label: "Content" },
      { value: "full", label: "Full" },
    ]);

    const userMaxWidth = fieldsByPath.get("layout.messages.user.maxWidth");
    const assistantMaxWidth = fieldsByPath.get(
      "layout.messages.assistant.maxWidth"
    );
    expect(userMaxWidth?.parseValue?.(" 72ch ")).toBe("72ch");
    expect(userMaxWidth?.parseValue?.("  ")).toBeUndefined();
    expect(assistantMaxWidth?.parseValue?.("80%")).toBe("80%");
    expect(assistantMaxWidth?.parseValue?.("")).toBeUndefined();
  });

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

  it("exposes a shadow control for every themeable component", () => {
    const fieldPaths = COMPONENTS_SECTIONS.flatMap((section) => section.fields.map((field) => field.path));

    // Pre-existing shadow controls.
    expect(fieldPaths).toContain("theme.components.launcher.shadow");
    expect(fieldPaths).toContain("theme.components.panel.shadow");
    expect(fieldPaths).toContain("theme.components.scrollToBottom.shadow");
    // Newly added component shadow controls.
    expect(fieldPaths).toContain("theme.components.message.user.shadow");
    expect(fieldPaths).toContain("theme.components.message.assistant.shadow");
    expect(fieldPaths).toContain("theme.components.toolBubble.shadow");
    expect(fieldPaths).toContain("theme.components.reasoningBubble.shadow");
    expect(fieldPaths).toContain("theme.components.approval.requested.shadow");
    expect(fieldPaths).toContain("theme.components.introCard.shadow");
    expect(fieldPaths).toContain("theme.components.composer.shadow");
  });

  it("exposes detached panel token controls", () => {
    const componentPaths = COMPONENTS_SECTIONS.flatMap((section) => section.fields.map((field) => field.path));
    const stylePaths = STYLE_SECTIONS.flatMap((section) => section.fields.map((field) => field.path));

    expect(componentPaths).toContain("theme.components.panel.inset");
    expect(stylePaths).toContain("theme.components.panel.canvasBackground");
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

  it("moves persistable stream controls out of developer debug without duplicates", () => {
    const debugSection = CONFIGURE_SECTIONS.find((section) => section.id === "debug-inspection");
    const preferenceSection = CONFIGURE_SECTIONS.find(
      (section) => section.id === "stream-display-preferences"
    );

    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.collapsedMode")).toBe(false);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.activePreview")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.previewMaxLines")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.toolCallDisplay.activeMinHeight")).toBe(true);
    expect(preferenceSection?.fields.some((field) => field.path === "features.toolCallDisplay.collapsedMode")).toBe(true);
    expect(preferenceSection?.fields.some((field) => field.path === "features.toolCallDisplay.expandable")).toBe(true);
    expect(preferenceSection?.fields.some((field) => field.path === "features.toolCallDisplay.grouped")).toBe(true);
    expect(preferenceSection?.fields.some((field) => field.path === "features.toolCallDisplay.groupedMode")).toBe(true);

    const paths = CONFIGURE_SECTIONS.flatMap((section) =>
      section.fields.map((field) => field.path)
    );
    expect(paths.filter((path) => path === "features.toolCallDisplay.grouped")).toHaveLength(1);
  });

  it("exposes inheritable capability-tagged artifact preference fields", () => {
    const section = CONFIGURE_SECTIONS.find(
      (entry) => entry.id === "artifact-display-preferences"
    );
    const paths = section?.fields.map((field) => field.path) ?? [];
    expect(paths).toEqual(
      expect.arrayContaining([
        "features.artifacts.display.files",
        "features.artifacts.display.byKind.component",
        "features.artifacts.display.default",
        "features.artifacts.filePreview.enabled",
      ])
    );
    expect(paths).not.toContain("features.artifacts.display.byKind.markdown");
    expect(paths).not.toContain("features.artifacts.display.byCategory.document");
    expect(paths).not.toContain("features.artifacts.display.byCategory.application");
    expect(section?.requiresCapability).toBe("artifacts");
    expect(section?.fields.every((field) => field.unsettable)).toBe(true);
  });

  it("exposes product-facing artifact toolbar copy", () => {
    const section = CONFIGURE_SECTIONS.find((entry) => entry.id === "artifacts-customization");
    const paths = section?.fields.map((field) => field.path) ?? [];

    expect(paths).toContain("features.artifacts.layout.toolbarTitle");
    expect(paths).toContain("features.artifacts.layout.closeButtonLabel");

    // The deprecated no-op unifiedSplitChrome control is gone (welding is now default).
    expect(paths).not.toContain("features.artifacts.layout.unifiedSplitChrome");
    // Split gap defaults to the welded 0, not the old 0.5rem.
    const splitGap = section?.fields.find(
      (field) => field.path === "features.artifacts.layout.splitGap"
    );
    expect(splitGap?.defaultValue).toBe("0");
  });

  it("exposes collapsed reasoning preview controls", () => {
    const debugSection = CONFIGURE_SECTIONS.find((section) => section.id === "debug-inspection");
    const preferenceSection = CONFIGURE_SECTIONS.find(
      (section) => section.id === "stream-display-preferences"
    );

    expect(preferenceSection?.fields.some((field) => field.path === "features.reasoningDisplay.expandable")).toBe(true);
    expect(preferenceSection?.fields.some((field) => field.path === "features.reasoningDisplay.activePreview")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.reasoningDisplay.previewMaxLines")).toBe(true);
    expect(debugSection?.fields.some((field) => field.path === "features.reasoningDisplay.activeMinHeight")).toBe(true);
  });

  it("exposes stream animation controls", () => {
    const section = CONFIGURE_SECTIONS.find((entry) => entry.id === "stream-animation");

    expect(section).toBeDefined();
    const paths = section?.fields.map((field) => field.path) ?? [];
    expect(paths).toEqual(
      expect.arrayContaining([
        "features.streamAnimation.type",
        "features.streamAnimation.placeholder",
        "features.streamAnimation.buffer",
        "features.streamAnimation.speed",
        "features.streamAnimation.duration",
      ])
    );

    const speedField = section?.fields.find((field) => field.path === "features.streamAnimation.speed");
    expect(speedField?.parseValue?.("240")).toBe(240);
  });
});
