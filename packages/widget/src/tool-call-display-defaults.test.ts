import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_CONFIG, mergeWithDefaults } from "./defaults";

describe("tool call display defaults", () => {
  it("keeps advanced tool call transcript modes disabled by default", () => {
    expect(DEFAULT_WIDGET_CONFIG.features?.toolCallDisplay).toEqual({
      collapsedMode: "tool-call",
      activePreview: false,
      grouped: false,
      groupedMode: "stack",
      groupBoundary: "adjacent",
      previewMaxLines: 3,
      expandable: true,
      loadingAnimation: "none",
    });
  });

  it("keeps advanced reasoning transcript modes disabled by default", () => {
    expect(DEFAULT_WIDGET_CONFIG.features?.reasoningDisplay).toEqual({
      activePreview: false,
      previewMaxLines: 3,
      expandable: true,
      loadingAnimation: "none",
    });
  });

  it("fills omitted tool display options when one option is overridden", () => {
    const override = { collapsedMode: "tool-name" as const, expandable: false };
    expect(mergeWithDefaults({ features: { toolCallDisplay: override } }).features?.toolCallDisplay)
      .toEqual({ ...DEFAULT_WIDGET_CONFIG.features?.toolCallDisplay, ...override });
    expect(DEFAULT_WIDGET_CONFIG.features?.toolCallDisplay?.collapsedMode).toBe("tool-call");
  });

  it("fills omitted reasoning display options without losing explicit false or zero", () => {
    const override = { activePreview: false, previewMaxLines: 0, expandable: false };
    expect(mergeWithDefaults({ features: { reasoningDisplay: override } }).features?.reasoningDisplay)
      .toEqual({ ...DEFAULT_WIDGET_CONFIG.features?.reasoningDisplay, ...override });
    expect(DEFAULT_WIDGET_CONFIG.features?.reasoningDisplay?.previewMaxLines).toBe(3);
  });

  it("retains optional display settings and leaves unrelated features intact", () => {
    const result = mergeWithDefaults({
      features: {
        showToolCalls: false,
        toolCallDisplay: { grouped: true, activeMinHeight: "100px", completedVisibility: "removed" },
        reasoningDisplay: { loadingAnimation: "shimmer" },
      },
    });
    expect(result.features?.showToolCalls).toBe(false);
    expect(result.features?.toolCallDisplay?.activeMinHeight).toBe("100px");
    expect(result.features?.toolCallDisplay?.completedVisibility).toBe("removed");
    expect(result.features?.toolCallDisplay?.grouped).toBe(true);
    expect(result.features?.reasoningDisplay).toEqual({
      ...DEFAULT_WIDGET_CONFIG.features?.reasoningDisplay,
      loadingAnimation: "shimmer",
    });
  });
});
