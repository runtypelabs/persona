import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const widgetCss = readFileSync(
  new URL("./widget.css", import.meta.url),
  "utf8",
);

describe("suggestion interaction styles", () => {
  it("keeps suggestion surfaces from collapsing inside constrained transcripts", () => {
    const selector = ".persona-suggestions {";
    const start = widgetCss.indexOf(selector);
    const end = widgetCss.indexOf("\n}", start);
    const surfaceRule = widgetCss.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(surfaceRule).toContain("flex-shrink: 0");
  });

  it("preserves the primary treatment when an emphasized suggestion is hovered", () => {
    const selector =
      '.persona-suggestion[data-emphasis="primary"]:hover {';
    const start = widgetCss.indexOf(selector);
    const end = widgetCss.indexOf("\n  }", start);
    const hoverRule = widgetCss.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(hoverRule).toContain("border-color: var(--persona-primary)");
    expect(hoverRule).toContain("background: var(--persona-primary)");
    expect(hoverRule).toContain("color: var(--persona-text-inverse)");
  });

  it("masks only the scrollable chip edges that still contain content", () => {
    expect(widgetCss).toContain(
      '[data-overflow="scroll"][data-scroll-right]:not(',
    );
    expect(widgetCss).toContain(
      '[data-overflow="scroll"][data-scroll-left]:not(',
    );
    expect(widgetCss).toContain(
      '[data-overflow="scroll"][data-scroll-left][data-scroll-right]',
    );
    expect(widgetCss).toContain(
      "--persona-suggestion-scroll-fade-size: 32px",
    );
  });
});
