// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";

import { createDemoConfigInspector } from "./demo-config-inspector";

describe("demo config inspector", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("shows plugin ids and hook names without serializing functions", () => {
    document.body.innerHTML = '<div data-config-inspector></div>';
    const inspector = createDemoConfigInspector();

    inspector.update({
      config: {
        plugins: [
          {
            id: "suggestion-hooks",
            transformSuggestions: () => [],
            renderSuggestion: () => null,
            onSuggestionSelect: () => undefined,
          },
        ],
      },
    });

    const code = inspector.root.querySelector("code")?.textContent ?? "";
    expect(code).toContain('"id": "suggestion-hooks"');
    expect(code).toContain('"transformSuggestions"');
    expect(code).toContain('"renderSuggestion"');
    expect(code).toContain('"onSuggestionSelect"');
    expect(code).not.toContain("function");

    inspector.destroy();
  });
});
