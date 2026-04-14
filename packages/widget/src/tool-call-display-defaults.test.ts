import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_CONFIG } from "./defaults";

describe("tool call display defaults", () => {
  it("keeps advanced tool call transcript modes disabled by default", () => {
    expect(DEFAULT_WIDGET_CONFIG.features?.toolCallDisplay).toEqual({
      collapsedMode: "tool-call",
      activePreview: false,
      grouped: false,
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
    });
  });
});
