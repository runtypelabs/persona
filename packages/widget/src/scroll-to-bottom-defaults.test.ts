import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_CONFIG } from "./defaults";

describe("scroll-to-bottom defaults", () => {
  it("defaults to an enabled icon-only circular control", () => {
    expect(DEFAULT_WIDGET_CONFIG.features?.scrollToBottom).toEqual({
      enabled: true,
      iconName: "arrow-down",
      label: "",
    });
  });
});
