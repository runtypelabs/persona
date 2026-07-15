import { describe, expect, it } from "vitest";
import html from "../analytics-agent-demo.html?raw";

const extractAttribute = (attribute: string): string[] => {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, "g");
  const values: string[] = [];
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    values.push(match[1]);
  }
  return values;
};

describe("analytics demo page ask prompts", () => {
  it("defines both immediate asks and drafted asks", () => {
    expect(extractAttribute("data-ask").length).toBeGreaterThanOrEqual(2);
    expect(extractAttribute("data-ask-draft").length).toBeGreaterThanOrEqual(3);
  });

  it("phrases every page prompt as a business question rather than a chart instruction", () => {
    for (const prompt of [...extractAttribute("data-ask"), ...extractAttribute("data-ask-draft")]) {
      expect(prompt).not.toMatch(/\b(chart|graph|plot|sql|flint|x-axis|y-axis|visual)\b/i);
      expect(prompt).toMatch(/[?.]$/);
    }
  });
});
