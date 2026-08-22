import { describe, expect, it } from "vitest";

import {
  COMPONENT_COLOR_SECTIONS,
  COMPONENT_SHAPE_SECTIONS,
  COMPONENTS_SECTIONS,
  CONFIGURE_SECTIONS,
  INTERFACE_ROLES_SECTION,
  STYLE_SECTIONS,
} from "./sections";
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

  it("exposes suggestion behavior and component token controls", () => {
    const suggestions = CONFIGURE_SECTIONS.find(
      (section) => section.id === "suggestions"
    );
    const configPaths =
      suggestions?.fields.map((field) => field.path) ?? [];
    expect(configPaths).toEqual(
      expect.arrayContaining([
        "suggestions.starters.variant",
        "suggestions.starters.placement",
        "suggestions.starters.behavior",
        "suggestions.followUps.variant",
        "suggestions.followUps.placement",
        "suggestions.followUps.behavior",
        "suggestions.followUps.overflow",
      ])
    );

    const componentPaths = COMPONENTS_SECTIONS.flatMap((section) =>
      section.fields.map((field) => field.path)
    );
    expect(componentPaths).toEqual(
      expect.arrayContaining([
        "theme.components.suggestion.chip.background",
        "theme.components.suggestion.chip.hoverBackground",
        "theme.components.suggestion.chip.focusRing",
        "theme.components.suggestion.card.background",
        "theme.components.suggestion.card.shadow",
        "theme.components.suggestion.list.background",
      ])
    );
  });

  it("exposes the launcher icon stroke as a unitless slider", () => {
    const section = COMPONENT_SHAPE_SECTIONS.find(
      (entry) => entry.id === "comp-launcher"
    );
    const stroke = section?.fields.find(
      (field) => field.path === "theme.components.launcher.iconStrokeWidth"
    );

    expect(stroke?.defaultValue).toBe("1.5");
    // Unitless slider: the stroke must never pick up a px suffix, and the
    // WebMCP escape hatch coerces sliders to raw numbers while token
    // resolution only walks string values.
    expect(stroke?.slider?.unit).toBe("none");
    expect(stroke?.parseValue?.(1.5)).toBe("1.5");
    expect(stroke?.parseValue?.("1.75")).toBe("1.75");
  });

  it("exposes the three shared header control knobs as live shape fields", () => {
    const section = COMPONENT_SHAPE_SECTIONS.find(
      (entry) => entry.id === "comp-header-controls"
    );
    const fieldsByPath = new Map(
      section?.fields.map((field) => [field.path, field]) ?? []
    );

    const size = fieldsByPath.get("theme.components.header.controlSize");
    const iconSize = fieldsByPath.get("theme.components.header.controlIconSize");
    const stroke = fieldsByPath.get("theme.components.header.controlStrokeWidth");

    expect(size?.defaultValue).toBe("32px");
    expect(iconSize?.defaultValue).toBe("20px");
    expect(stroke?.defaultValue).toBe("1.5");

    // Unitless slider: the stroke must never pick up a px suffix.
    expect(stroke?.slider?.unit).toBe("none");
    expect(size?.slider?.unit).toBeUndefined();

    // The WebMCP escape hatch coerces sliders to raw numbers, and token
    // resolution only walks string values.
    expect(size?.parseValue?.(44)).toBe("44px");
    expect(size?.parseValue?.("2.5rem")).toBe("2.5rem");
    expect(stroke?.parseValue?.(2)).toBe("2");
    expect(stroke?.parseValue?.("1.75")).toBe("1.75");

    // Sizes are not colors: light/dark scoping must never fork them.
    expect(
      COMPONENT_COLOR_SECTIONS.some((entry) => entry.id === "comp-header-controls")
    ).toBe(false);
  });

  it("exposes the header and rail header band controls", () => {
    const headerControls = COMPONENT_SHAPE_SECTIONS.find(
      (entry) => entry.id === "comp-header-controls"
    );
    const minHeight = headerControls?.fields.find(
      (field) => field.path === "theme.components.header.minHeight"
    );
    expect(minHeight?.type).toBe("text");
    // Blank keeps the built-in auto height instead of writing an empty token.
    expect(minHeight?.parseValue?.(" 65px ")).toBe("65px");
    expect(minHeight?.parseValue?.("")).toBeUndefined();

    const railShape = COMPONENT_SHAPE_SECTIONS.find(
      (entry) => entry.id === "comp-history-rail-header"
    );
    const railPaths = railShape?.fields.map((field) => field.path) ?? [];
    expect(railPaths).toEqual([
      "theme.components.history.railHeader.minHeight",
      "theme.components.history.railHeader.border",
    ]);

    const railColors = COMPONENT_COLOR_SECTIONS.find(
      (entry) => entry.id === "comp-history-rail-header-colors"
    );
    const background = railColors?.fields.find(
      (field) => field.path === "theme.components.history.railHeader.background"
    );
    expect(background?.type).toBe("token-ref");
    expect(background?.tokenRef?.tokenType).toBe("color");

    // Sizes are not colors: light/dark scoping must never fork them.
    expect(
      COMPONENT_COLOR_SECTIONS.some(
        (entry) => entry.id === "comp-history-rail-header"
      )
    ).toBe(false);
  });

  it("exposes the floating rail surface controls", () => {
    const shape = COMPONENT_SHAPE_SECTIONS.find(
      (entry) => entry.id === "comp-history-overlay"
    );
    expect(shape?.fields.map((field) => field.path)).toEqual([
      "theme.components.history.overlay.margin",
      "theme.components.history.overlay.borderRadius",
      "theme.components.history.overlay.shadow",
    ]);
    // Blank keeps the built-in default instead of writing an empty token.
    const margin = shape?.fields[0];
    expect(margin?.type).toBe("text");
    expect(margin?.parseValue?.(" 12px ")).toBe("12px");
    expect(margin?.parseValue?.("")).toBeUndefined();

    const colors = COMPONENT_COLOR_SECTIONS.find(
      (entry) => entry.id === "comp-history-overlay-colors"
    );
    const background = colors?.fields.find(
      (field) => field.path === "theme.components.history.overlay.background"
    );
    expect(background?.type).toBe("token-ref");
    expect(background?.tokenRef?.tokenType).toBe("color");

    // Geometry is not color: the shape section never forks per light/dark.
    expect(
      COMPONENT_COLOR_SECTIONS.some((entry) => entry.id === "comp-history-overlay")
    ).toBe(false);
  });

  it("exposes the tooltip shape and color controls", () => {
    const shape = COMPONENT_SHAPE_SECTIONS.find(
      (entry) => entry.id === "comp-tooltip"
    );
    const shapePaths = shape?.fields.map((field) => field.path) ?? [];
    expect(shapePaths).toEqual([
      "theme.components.tooltip.borderRadius",
      "theme.components.tooltip.fontSize",
      "theme.components.tooltip.arrow",
    ]);

    const fontSize = shape?.fields.find(
      (field) => field.path === "theme.components.tooltip.fontSize"
    );
    // Blank keeps the built-in 12px instead of writing an empty token.
    expect(fontSize?.parseValue?.(" 13px ")).toBe("13px");
    expect(fontSize?.parseValue?.("")).toBeUndefined();

    const arrow = shape?.fields.find(
      (field) => field.path === "theme.components.tooltip.arrow"
    );
    expect(arrow?.type).toBe("toggle");
    expect(arrow?.defaultValue).toBe(true);

    const colors = COMPONENT_COLOR_SECTIONS.find(
      (entry) => entry.id === "comp-tooltip-colors"
    );
    expect(colors?.fields.map((field) => field.path)).toEqual([
      "theme.components.tooltip.background",
      "theme.components.tooltip.foreground",
      "theme.components.tooltip.hintForeground",
    ]);
    expect(
      colors?.fields.every((field) => field.tokenRef?.tokenType === "color")
    ).toBe(true);

    // Sizes are not colors: light/dark scoping must never fork them.
    expect(
      COMPONENT_COLOR_SECTIONS.some((entry) => entry.id === "comp-tooltip")
    ).toBe(false);
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
