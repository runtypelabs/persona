import { describe, expect, it } from "vitest";

import { WEBMCP_CALENDAR_FLOW } from "./webmcp-calendar.js";
import { WEBMCP_DOCKED_FLOW } from "./webmcp-docked.js";
import { WEBMCP_SLIDES_FLOW } from "./webmcp-slides.js";
import { WEBMCP_STOREFRONT_FLOW } from "./webmcp-storefront.js";
import { THEME_ASSISTANT_FLOW } from "./theme-assistant.js";
import type { RuntypeFlowConfig } from "../index.js";

const webMcpFlows: Array<[string, RuntypeFlowConfig]> = [
  ["calendar", WEBMCP_CALENDAR_FLOW],
  ["docked", WEBMCP_DOCKED_FLOW],
  ["slides", WEBMCP_SLIDES_FLOW],
  ["storefront", WEBMCP_STOREFRONT_FLOW],
  ["theme assistant", THEME_ASSISTANT_FLOW],
];

const systemPromptFor = (flow: RuntypeFlowConfig): string => {
  const prompt = flow.steps[0]?.config.systemPrompt;
  if (typeof prompt !== "string") {
    throw new Error(`${flow.name} is missing a system prompt`);
  }
  return prompt;
};

describe("WebMCP flow prompts", () => {
  it.each(webMcpFlows)(
    "%s prompt tells the model to call exact runtime tool names",
    (_name, flow) => {
      const prompt = systemPromptFor(flow);

      expect(prompt).toContain(
        "Always call the exact name present in the current tool list.",
      );
      expect(prompt).toContain(
        "do not translate underscores into other namespace punctuation",
      );
    },
  );

  it.each(webMcpFlows)(
    "%s prompt does not teach colon-prefixed WebMCP call spellings",
    (_name, flow) => {
      const prompt = systemPromptFor(flow);

      expect(prompt).not.toMatch(/\bwebmcp:/);
      expect(prompt).not.toContain("webmcp:*");
      expect(prompt).not.toContain("webmcp:<name>");
    },
  );
});
