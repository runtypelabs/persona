import { describe, expect, it } from "vitest";
import { mergeWithDefaults } from "../defaults";
import type { AgentWidgetConfig } from "../types";
import { FIRST_TURN_CHUNKS, selectRendererChunks, selectRevealChunks } from "./renderer-chunks";

/**
 * The installer preloads from a host's raw config; the widget prepares from the
 * same config after `mergeWithDefaults`. They must name the same chunks, or the
 * warm-up either misses a file the reveal then waits on, or fetches one it
 * never uses.
 */
const CONFIGS: Array<[name: string, config: AgentWidgetConfig]> = [
  ["empty", {}],
  ["V5 defaults", { future: { v5Defaults: true } }],
  ["V5 without artifacts", { future: { v5Defaults: true }, features: { artifacts: { enabled: false } } }],
  ["V4 with artifacts", { features: { artifacts: { enabled: true } } }],
  ["tools and reasoning hidden", { features: { showToolCalls: false, showReasoning: false } }],
  ["tools hidden, reasoning shown", { features: { showToolCalls: false } }],
  ["hidden activity with a label indicator", {
    features: { showToolCalls: false, showReasoning: false }, loadingIndicator: { variant: "label" },
  }],
  ["hidden activity, V5 label indicator", {
    future: { v5Defaults: true }, features: { showToolCalls: false, showReasoning: false },
  }],
  ["hidden activity, V5 dots indicator", {
    future: { v5Defaults: true }, features: { showToolCalls: false, showReasoning: false },
    loadingIndicator: { variant: "dots" },
  }],
  ["hidden activity, label animation off", {
    features: { showToolCalls: false, showReasoning: false },
    loadingIndicator: { variant: "label" }, loadingLabel: { animation: "none" },
  }],
  ["turn activity with activity hidden", {
    turnActivity: { enabled: true }, features: { showToolCalls: false, showReasoning: false },
  }],
  ["voice off", { voiceRecognition: { enabled: false } }],
  ["voice on, browser provider", { voiceRecognition: { enabled: true } }],
  ["Runtype session voice", {
    voiceRecognition: { enabled: true, provider: { type: "runtype", runtype: { agentId: "agent_1" } } },
  }],
  ["custom voice in review mode", {
    voiceRecognition: { enabled: true, completionBehavior: "review", provider: { type: "custom", custom: () => ({}) as never } },
  }],
  ["context mentions", { contextMentions: { enabled: true, sources: [] } }],
  ["visitor history", { features: { history: { enabled: true } } }],
  ["visitor history off", { features: { history: { enabled: false } } }],
  ["everything", {
    future: { v5Defaults: true }, turnActivity: { enabled: true }, contextMentions: { enabled: true, sources: [] },
    voiceRecognition: { enabled: true, provider: { type: "runtype", runtype: { agentId: "agent_1" } } },
  }],
];

describe("selectRendererChunks", () => {
  it.each(CONFIGS)("names the same chunks for a raw and a merged config: %s", (_name, config) => {
    const merged = mergeWithDefaults(config) as AgentWidgetConfig;
    expect(selectRendererChunks(config)).toEqual(selectRendererChunks(merged));
    expect(selectRevealChunks(config)).toEqual(selectRevealChunks(merged));
  });

  it("always needs the composer controls and the markdown parsers", () => {
    for (const [, config] of CONFIGS) {
      expect(selectRendererChunks(config).slice(0, 2)).toEqual(["composer-actions-runtime", "markdown-parsers"]);
    }
  });

  it("selects by feature", () => {
    expect(selectRendererChunks({})).toEqual([
      "composer-actions-runtime", "markdown-parsers", "activity-ui", "loading-label-runtime", "dictation-runtime",
    ]);
    const quiet: AgentWidgetConfig = {
      features: { showToolCalls: false, showReasoning: false }, voiceRecognition: { enabled: false },
    };
    expect(selectRendererChunks(quiet)).toEqual(["composer-actions-runtime", "markdown-parsers"]);
    expect(selectRendererChunks({ ...quiet, future: { v5Defaults: true } })).toEqual([
      "composer-actions-runtime", "markdown-parsers", "loading-label-runtime", "artifacts-ui",
    ]);
    expect(selectRendererChunks({ ...quiet, turnActivity: { enabled: true } })).toEqual([
      "composer-actions-runtime", "markdown-parsers", "turn-activity-ui", "activity-ui", "loading-label-runtime",
    ]);
    expect(selectRendererChunks({
      ...quiet, contextMentions: { enabled: true, sources: [] },
      voiceRecognition: { enabled: true, provider: { type: "runtype", runtype: { agentId: "agent_1" } } },
    })).toEqual([
      "composer-actions-runtime", "markdown-parsers", "dictation-runtime", "voice-runtime", "ui-extras",
    ]);
  });

  it("adds what the reveal loads outside the renderer set", () => {
    // The icon registry's tail, for every config.
    expect(selectRevealChunks({})).toEqual([...selectRendererChunks({}), "icons-extra"]);
    // The history shell, which the reveal also waits for when history is on.
    const history: AgentWidgetConfig = { features: { history: { enabled: true } } };
    expect(selectRevealChunks(history)).toEqual([...selectRendererChunks(history), "icons-extra", "history-shell"]);
    expect(selectRevealChunks({ features: { history: { enabled: false } } })).not.toContain("history-shell");
  });

  it("names the first turn's chunks by published file stem", () => {
    expect([...FIRST_TURN_CHUNKS]).toEqual(["client-dispatch", "client-stream"]);
  });
});
