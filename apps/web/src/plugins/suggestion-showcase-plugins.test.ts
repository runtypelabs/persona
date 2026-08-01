import { describe, expect, it } from "vitest";

import { createCuratedSuggestionsPlugin } from "./suggestion-showcase-plugins";

describe("createCuratedSuggestionsPlugin", () => {
  it("reorders suggestions before enriching the recommended item", () => {
    const plugin = createCuratedSuggestionsPlugin();
    const transformed = plugin.transformSuggestions?.({
      suggestions: [
        {
          id: "short",
          label: "Short",
          prompt: "Short",
          behavior: "send",
          emphasis: "default",
        },
        {
          id: "long",
          label: "A much longer suggestion",
          prompt: "A much longer suggestion",
          behavior: "send",
          emphasis: "default",
        },
        {
          id: "medium",
          label: "Medium label",
          prompt: "Medium label",
          behavior: "send",
          emphasis: "default",
        },
      ],
      surface: "followUp",
      source: "agent",
      config: {},
    });

    expect(
      transformed?.map((suggestion) =>
        typeof suggestion === "string" ? suggestion : suggestion.id,
      ),
    ).toEqual(["long", "medium", "short"]);
    const first = transformed?.[0];
    if (!first || typeof first === "string") {
      throw new Error("Expected an enriched suggestion object.");
    }
    expect(first).toMatchObject({
      label: "Recommended · A much longer suggestion",
      emphasis: "primary",
      icon: "sparkles",
    });
    expect(first.description).toContain("Based on this answer");
  });
});
