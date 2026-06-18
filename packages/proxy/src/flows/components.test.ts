import { describe, expect, test } from "vitest";

import { COMPONENT_FLOW } from "./components.js";

describe("component flow", () => {
  test("describes the unified dynamic components contract", () => {
    const prompt = COMPONENT_FLOW.steps[0]?.config.systemPrompt;

    expect(COMPONENT_FLOW.name).toBe("Dynamic Components Flow");
    expect(prompt).toContain("DynamicForm");
    expect(prompt).toContain("ProductCard");
    expect(prompt).toContain("SimpleChart");
    expect(prompt).toContain("StatusBadge");
    expect(prompt).toContain("InfoCard");
    expect(prompt).toContain("SCHEDULE, BOOK, SIGN UP, or provide DETAILS");
  });
});
