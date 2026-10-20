// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createToolBubble } from "./tool-bubble";
import { createReasoningBubble } from "./reasoning-bubble";
import { copyToolDetail } from "./tool-details";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";

const message = (tool: Partial<NonNullable<AgentWidgetMessage["toolCall"]>> = {}): AgentWidgetMessage => ({
  id: "tool", role: "assistant", content: "", createdAt: "2026-01-01", variant: "tool",
  toolCall: { id: "call", name: "Search", status: "complete", ...tool },
});
const render = (tool: Partial<NonNullable<AgentWidgetMessage["toolCall"]>>, config: AgentWidgetConfig = {}) =>
  createToolBubble(message(tool), { future: { v5Defaults: true }, ...config }, new Set(["tool"]));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("V5 tool details", () => {
  it.each([undefined, null, "", "  ", {}, [], "{}", "[]", "null"].map(value => [value]))("omits empty request %j", args => {
    const bubble = render({ args, result: "Done" });
    expect(bubble.querySelector('[data-persona-tool-detail="request"]')).toBeNull();
    expect(bubble.querySelector('[data-persona-tool-detail="response"] pre')?.textContent).toBe("Done");
  });
  it.each([0, false, { count: 0 }])("keeps meaningful request %j", args => {
    expect(render({ args }).querySelector('[data-persona-tool-detail="request"]')).not.toBeNull();
  });
  it("shows chunks during streaming and replaces them with the final result", () => {
    const running = render({ status: "running", chunks: ["Found ", "one"], result: "stale" });
    expect(running.querySelector("pre")?.textContent).toBe("Found one");
    const done = render({ chunks: ["Found one"], result: { count: 1 } });
    expect(done.querySelectorAll('[data-persona-tool-detail="response"]')).toHaveLength(1);
    expect(done.querySelector("pre")?.textContent).toBe('{\n  "count": 1\n}');
    expect(done.querySelector(".persona-tool-detail-code")).not.toBeNull();
  });
  it("keeps errors and escapes output, with plain prose typography", () => {
    const bubble = render({ result: '<img src=x onerror="alert(1)">', success: false, error: "Denied" });
    expect(bubble.querySelector("img")).toBeNull();
    expect(bubble.querySelector(".persona-tool-detail-code")).toBeNull();
    expect(bubble.querySelector("[data-persona-tool-error]")?.textContent).toBe("Denied");
  });
  it("preserves V4 sections and explicit V5 styles", () => {
    const legacy = createToolBubble(message({ args: {}, chunks: ["progress"], result: "done" }));
    expect(legacy.textContent).toContain("Arguments");
    expect(legacy.textContent).toContain("Activity");
    expect(legacy.textContent).toContain("Result");
    expect(legacy.querySelector(".persona-tool-detail")).toBeNull();
    const custom = render({ result: "done" }, { toolCall: {
      codeBlockBackgroundColor: "red", codeBlockTextColor: "blue", codeBlockBorderColor: "green", labelTextColor: "purple",
    } });
    expect(custom.querySelector<HTMLElement>(".persona-tool-detail")?.style.backgroundColor).toBe("red");
    expect(custom.querySelector<HTMLElement>("pre")?.style.color).toBe("blue");
    expect(custom.querySelector<HTMLElement>(".persona-tool-detail-label")?.style.color).toBe("purple");
  });
  it("uses a flat surface instead of inheriting markdown code boxes", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/styles/widget.css", "utf8");
    document.head.appendChild(style);
    const bubble = render({ result: "Plain response" });
    document.body.appendChild(bubble);
    try {
      const pre = bubble.querySelector("pre")!;
      expect(getComputedStyle(pre).padding).toBe("0px");
      expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(getComputedStyle(pre).backgroundColor);
      expect(getComputedStyle(pre).fontSize).toBe("13px");
    } finally { bubble.remove(); style.remove(); }
  });
  it("keeps shared panel content within ordinary and turn disclosures", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    try {
      for (const turn of [false, true]) {
        host.className = turn ? "persona-turn-activity-body" : "";
        const reasoning = createReasoningBubble({
          ...message(), id: "reasoning", variant: "reasoning", toolCall: undefined,
          reasoning: { id: "reasoning", status: "complete", chunks: ["Muted reasoning prose"] },
        }, { future: { v5Defaults: true }, features: { reasoningDisplay: { layout: "row", appearance: "panel" } } }, new Set(["reasoning"]));
        const tool = render({ args: { query: "sample" }, result: "Plain response" });
        host.replaceChildren(reasoning, tool);
        const prose = reasoning.querySelector<HTMLElement>(".persona-activity-body > div")!;
        expect(prose.textContent).toBe("Muted reasoning prose");
        expect(tool.querySelectorAll(".persona-tool-detail")).toHaveLength(2);
        expect(tool.querySelector(".persona-tool-detail-code")).not.toBeNull();
        expect(reasoning.querySelectorAll(".persona-border-t")).toHaveLength(1);
      }
    } finally { host.remove(); }
  });
  it("copies all output, shows a check, and restores the copy icon", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const text = "Long output\n".repeat(50);
    const button = render({ result: text }).querySelector<HTMLButtonElement>(".persona-tool-detail-copy")!;
    await copyToolDetail(button);
    expect(writeText).toHaveBeenCalledWith(text);
    expect(button.dataset.copied).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Copied");
    vi.advanceTimersByTime(1800);
    expect(button.dataset.copied).toBeUndefined();
    expect(button.getAttribute("aria-label")).toBe("Copy response");
  });
  it("handles unavailable clipboard without claiming success", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {});
    const button = render({ result: "done" }).querySelector<HTMLButtonElement>("button[data-persona-copy-tool-detail]")!;
    await copyToolDetail(button);
    expect(button.getAttribute("aria-label")).toBe("Copy failed — try again");
    expect(button.dataset.copied).toBeUndefined();
  });
});


describe.each([false, true])("tool detail metadata (V5 %s)", v5Defaults => {
  it.each(["row", "card"] as const)("hides the raw name by default and toggles it independently of the %s header", layout => {
    const tool = message({ name: "web_search", result: "Found documentation" });
    for (const showToolName of [undefined, true, false]) {
      const node = createToolBubble(tool, { future: { v5Defaults }, features: { toolCallDisplay: { layout, showToolName } } }, new Set([tool.id]));
      expect(node.querySelector("[data-persona-tool-name]")?.textContent ?? null).toBe(showToolName ? "web_search" : null);
      expect(node.querySelector("pre")?.textContent).toBe("Found documentation");
      expect(node.querySelector("button")?.textContent).not.toBe("");
    }
  });
  it.each(["row", "card"] as const)("keeps exact timing data in custom %s summaries without a built-in detail footer", layout => {
    const tool = message({ duration: 12789, durationMs: 12780, startedAt: 1000, completedAt: 13789, result: "Done" });
    const renderCollapsedSummary = vi.fn<NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderCollapsedSummary"]>>(({ toolCall, elapsed, createElapsedElement }) => {
      expect(toolCall).toBe(tool.toolCall);
      expect(toolCall).toMatchObject({ duration: 12789, durationMs: 12780, startedAt: 1000, completedAt: 13789 });
      expect(elapsed).toBe("13s");
      expect(createElapsedElement().textContent).toBe("13s");
      return `Host duration: ${toolCall.duration}ms`;
    });
    const node = createToolBubble(tool, { future: { v5Defaults }, features: { toolCallDisplay: { layout, durationDisplay: "none" } }, toolCall: { renderCollapsedSummary } }, new Set([tool.id]));
    expect(node.querySelector("button")?.textContent).toContain("Host duration: 12789ms");
    expect(node.querySelector(":scope > .persona-border-t")?.textContent).not.toContain("Duration:");
    expect(node.querySelector("pre")?.textContent).toBe("Done");
    expect(renderCollapsedSummary).toHaveBeenCalledOnce();
  });
});

describe("V5 card timing", () => {
  it.each(["none", "tools", "group", "all", undefined] as const)("only shows automatic card header timing in tools/all mode (%s)", durationDisplay => {
    const node = render({ name: "web_search", duration: 12789 }, { features: { toolCallDisplay: { layout: "card", durationDisplay } } });
    expect(node.querySelector("button")?.textContent).toBe(`Used web_search${durationDisplay === "tools" || durationDisplay === "all" ? "12s" : ""}`);
    expect(node.textContent).not.toContain("Duration:");
  });
  it("omits sub-second timing, preserves live elapsed attributes, and retains V4 card titles", () => {
    const settings: AgentWidgetConfig = { features: { toolCallDisplay: { layout: "card", durationDisplay: "tools" } } };
    expect(render({ duration: 700 }, settings).querySelector(".persona-activity-duration")?.textContent).toBe("");
    const startedAt = Date.now() - 2500;
    const live = render({ status: "running", startedAt }, settings).querySelector(".persona-activity-duration");
    expect(live?.getAttribute("data-tool-elapsed")).toBe(String(startedAt));
    expect(live?.textContent).toBe("2s");
    const legacy = createToolBubble(message({ duration: 12789 }), settings, new Set(["tool"]));
    expect(legacy.querySelector("button")?.textContent).toBe("Used tool for 13 seconds");
    expect(legacy.querySelector(".persona-activity-duration")).toBeNull();
    expect(legacy.textContent).not.toContain("Duration:");
  });
});
