// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createStandardBubble, renderLoadingIndicatorWithFallback } from "./message-bubble";
import type { AgentWidgetConfig } from "../types";

const config: AgentWidgetConfig = { apiUrl: "/chat", future: { v5Defaults: true } };

describe("inline waiting indicator", () => {
  it("uses the label for an empty streaming response and removes it on text or completion", () => {
    const bubble = (content: string, streaming: boolean) => createStandardBubble(
      { id: "answer", role: "assistant", content, streaming, createdAt: new Date().toISOString() },
      ({ text }) => text,
      undefined, undefined, undefined,
      { widgetConfig: config },
    );
    expect(bubble("", true).querySelector(".persona-loading-label")?.textContent).toBe("Thinking…");
    expect(bubble("An answer", true).querySelector(".persona-loading-label")).toBeNull();
    expect(bubble("", false).querySelector(".persona-loading-label")).toBeNull();
  });

  it("keeps custom rendering precedence and gives it the configured default", () => {
    const custom = document.createElement("span");
    custom.textContent = "Custom";
    expect(renderLoadingIndicatorWithFallback("inline", () => custom, config)).toBe(custom);
    const fallback = renderLoadingIndicatorWithFallback("inline", ({ defaultRenderer }) => defaultRenderer(), config);
    expect(fallback?.className).toBe("persona-loading-label");
  });
});
