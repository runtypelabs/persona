// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { appendCharSpans } from "./tool-loading-animation";

const NBSP = String.fromCharCode(0xa0);

describe("appendCharSpans", () => {
  it("wraps each character in a persona-tool-char span with a staggered index", () => {
    const container = document.createElement("div");
    const next = appendCharSpans(container, "ab", 0);

    const spans = container.querySelectorAll(".persona-tool-char");
    expect(spans.length).toBe(2);
    expect((spans[0] as HTMLElement).style.getPropertyValue("--char-index")).toBe("0");
    expect((spans[1] as HTMLElement).style.getPropertyValue("--char-index")).toBe("1");
    expect(spans[0].textContent).toBe("a");
    expect(spans[1].textContent).toBe("b");
    expect(next).toBe(2);
  });

  it("renders spaces as non-breaking spaces and honors the start index", () => {
    const container = document.createElement("div");
    const next = appendCharSpans(container, "a b", 5);

    const spans = container.querySelectorAll(".persona-tool-char");
    expect(spans.length).toBe(3);
    expect((spans[0] as HTMLElement).style.getPropertyValue("--char-index")).toBe("5");
    expect(spans[1].textContent).toBe(NBSP);
    expect(next).toBe(8);
  });
});
