// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createStandardBubble, createTypingIndicator, renderLoadingIndicatorWithFallback } from "./message-bubble";
import { registerIcons } from "../utils/icons";
import type { AgentWidgetConfig } from "../types";

const config: AgentWidgetConfig = { apiUrl: "/chat", future: { v5Defaults: true } };

describe("waiting label icons", () => {
  const icon = (options: AgentWidgetConfig["loadingIndicator"] = {}, overrides: Partial<AgentWidgetConfig> = {}) =>
    createTypingIndicator({ ...config, ...overrides, loadingIndicator: { variant: "label", ...options } }).querySelector<HTMLElement>(".persona-activity-icon");

  it("shows the default active spinner in V5, preserving V4 labels and dots", () => {
    expect(icon()?.dataset.loadingIconAnimation).toBe("spin");
    expect(icon()?.getAttribute("aria-hidden")).toBe("true");
    expect(icon({}, { future: undefined })).toBeNull();
    expect(icon({ iconVisibility: "active" }, { future: undefined })).not.toBeNull();
    expect(createTypingIndicator({ ...config, loadingIndicator: { variant: "dots", iconName: "star" } }).querySelector(".persona-activity-icon")).toBeNull();
  });

  it("lets explicit visibility override inherited group settings without leaving a slot", () => {
    const features = { toolCallDisplay: { groupIconVisibility: "never" as const } };
    expect(icon({}, { features })).toBeNull();
    expect(icon({ iconVisibility: "always" }, { features })).not.toBeNull();
    expect(icon({ iconVisibility: "active" }, { features })).not.toBeNull();
    expect(icon({ iconVisibility: "never" })).toBeNull();
    expect(createTypingIndicator({ ...config, loadingIndicator: { iconVisibility: "never" } }).children).toHaveLength(1);
  });

  it("uses the shared registry and animates custom glyphs only on explicit request", () => {
    registerIcons({ "waiting-test": [["path", { d: "M1 2L3 4" }]] });
    const custom = icon({ iconName: "waiting-test" });
    expect(custom?.querySelector("path")?.getAttribute("d")).toBe("M1 2L3 4");
    expect(custom?.dataset.loadingIconAnimation).toBe("none");
    expect(icon({ iconName: "waiting-test", iconAnimation: "spin" })?.dataset.loadingIconAnimation).toBe("spin");
    expect(icon({ iconAnimation: "none" })?.dataset.loadingIconAnimation).toBe("none");
  });
});

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
    expect(fallback?.classList.contains("persona-loading-label")).toBe(true);
    expect(fallback?.classList.contains("persona-activity-row")).toBe(true);
  });
});
