// @vitest-environment jsdom

/**
 * Locked 4.22.0 defaults contract. The fixture was captured before the v5
 * defaults work began and must not be regenerated as part of later changes.
 *
 * JSDOM does not perform browser layout or resolve inherited custom
 * properties. This test therefore records the DOM-facing computed declarations
 * it can reliably expose, alongside the resolved config and emitted token map.
 * The Playwright visual harness covers physical layout separately.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { mergeWithDefaults } from "./defaults";
import { createAgentExperience } from "./ui";
import { createTheme, themeToCssVariables } from "./utils/tokens";

const fixturePath = resolve(process.cwd(), "src/__fixtures__/defaults-parity.v4.json");
const stylesheetPath = resolve(process.cwd(), "src/styles/widget.css");

const styles = (element: Element | null) => {
  if (!element) throw new Error("Expected baseline element to be rendered");
  const computed = getComputedStyle(element);
  return Object.fromEntries(
    ["display", "position", "background-color", "color", "border-radius", "padding", "margin", "font-size", "line-height", "box-shadow", "width", "height"].map(
      (property) => [property, computed.getPropertyValue(property)]
    )
  );
};

const snapshot = (v5Defaults = false) => {
  const stylesheet = document.createElement("style");
  stylesheet.textContent = readFileSync(stylesheetPath, "utf8");
  document.head.appendChild(stylesheet);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { autoExpand: true },
    persistState: false,
    future: { v5Defaults },
  });
  controller.injectUserMessage({ content: "Baseline user message" });
  controller.injectAssistantMessage({ content: "Baseline assistant message" });
  controller.injectTestMessage({
    type: "message",
    message: {
      id: "baseline-tool",
      role: "assistant",
      content: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      sequence: 3,
      streaming: false,
      variant: "tool",
      toolCall: { id: "baseline-tool", name: "baseline_tool", status: "complete", chunks: ["done"] },
    },
  });

  const result = {
    themeCssVariables: themeToCssVariables(createTheme(undefined, { future: { v5Defaults } })),
    mergedDefaultConfig: mergeWithDefaults(),
    computedStyles: {
      header: styles(mount.querySelector(".persona-widget-header")),
      userBubble: styles(mount.querySelector(".persona-message-row-user .persona-message-bubble")),
      assistantBubble: styles(mount.querySelector(".persona-message-row-assistant .persona-message-bubble")),
      composer: styles(mount.querySelector("[data-persona-composer-form]")),
      launcher: styles(mount.querySelector(".persona-launcher-surface button")),
      toolBubble: styles(mount.querySelector(".persona-tool-bubble")),
    },
  };
  controller.destroy();
  mount.remove();
  stylesheet.remove();
  return result;
};

afterEach(() => document.body.replaceChildren());

type DefaultsSnapshot = ReturnType<typeof snapshot>;

// JSDOM leaves some computed declarations as var(...) strings. Resolve a
// whole-value reference against that snapshot's own emitted tokens before
// comparing, so deleting an unreachable fallback is not a visual regression.
// Unknown references stay verbatim; changes to actual tokens still fail the
// independent, complete themeCssVariables comparison. The fixture stays intact.
const resolveComputedTokens = (value: DefaultsSnapshot): DefaultsSnapshot => ({
  ...value,
  computedStyles: Object.fromEntries(
    Object.entries(value.computedStyles).map(([name, declarations]) => [name,
      Object.fromEntries(Object.entries(declarations).map(([property, declaration]) => {
        const seen = new Set<string>();
        let resolved = declaration;
        while (!seen.has(resolved)) {
          seen.add(resolved);
          const reference = /^var\((--[\w-]+)(?:,\s*([\s\S]*))?\)$/.exec(resolved);
          const token = reference && value.themeCssVariables[reference[1]];
          if (typeof token === "string") resolved = token;
          else if (reference?.[2] !== undefined) resolved = reference[2];
          else break;
        }
        return [property, resolved.replace(/([\d.]+)rem\b/g, (_, amount) => `${Number(amount) * 16}px`)];
      })),
    ])
  ) as DefaultsSnapshot["computedStyles"],
});

describe("4.22.0 defaults parity (flag off)", () => {
  it("matches the committed baseline", () => {
    // JSON is deliberately the fixture format: it makes omitted/undefined
    // config and token values deterministic across Node versions.
    const actual = JSON.parse(JSON.stringify(snapshot(false)));
    const baseline = JSON.parse(readFileSync(fixturePath, "utf8"));
    // Phase 3 activates formerly unused tokens. Lock their old and new values
    // explicitly instead of rewriting the historical fixture or ignoring keys.
    const activatedTokens: Record<string, [string, string]> = {
      "--persona-components-header-padding": ["1rem", "20px 24px"],
      "--persona-components-panel-height": ["600px", "min(640px, max(200px, calc(100vh - 64px)))"],
      "--persona-components-panel-maxHeight": ["calc(100vh - 80px)", "none"],
      "--persona-components-panel-maxWidth": ["440px", "none"],
    };
    const addedTokens: Record<string, string> = {
      "--persona-panel-background": baseline.themeCssVariables["--persona-surface"],
      "--persona-transcript-background": baseline.themeCssVariables["--persona-container"],
      "--persona-transcript-top-fade-background": baseline.themeCssVariables["--persona-container"],
      "--persona-composer-footer-background": baseline.themeCssVariables["--persona-surface"],
      "--persona-composer-footer-padding": "1rem 1.5rem",
      "--persona-components-header-minimalPadding": "16px 24px",
      "--persona-components-message-gap": "12px",
      "--persona-cw-container": "#f9fafb",
      "--persona-cw-surface": "#f9fafb",
      "--persona-cw-border": "#e5e7eb",
    };
    for (const [mode, border, shadow, radius] of [
      ["floating", "1px solid var(--persona-border)", baseline.themeCssVariables["--persona-components-panel-shadow"], "0.75rem"],
      ["inline", "1px solid var(--persona-border)", "none", "0.75rem"],
      ["docked", "none", "none", "0.75rem"],
      ["sidebar", "none", undefined, "0"],
      ["mobile", "none", "none", "0"],
    ]) {
      addedTokens[`--persona-components-panel-modes-${mode}-border`] = border!;
      addedTokens[`--persona-components-panel-modes-${mode}-borderRadius`] = radius!;
      if (shadow !== undefined) addedTokens[`--persona-components-panel-modes-${mode}-shadow`] = shadow;
    }
    // Resolve computed declarations before adapting the token map for comparison.
    // The baseline stylesheet uses rem; this JSDOM harness assumes a 16px root.
    const resolvedActual = resolveComputedTokens(actual);
    const resolvedBaseline = resolveComputedTokens(baseline);
    resolvedActual.themeCssVariables = { ...actual.themeCssVariables };
    for (const [key, [oldValue, newValue]] of Object.entries(activatedTokens)) {
      expect(baseline.themeCssVariables[key], key).toBe(oldValue);
      expect(actual.themeCssVariables[key], key).toBe(newValue);
      resolvedActual.themeCssVariables[key] = oldValue;
    }
    for (const [key, value] of Object.entries(addedTokens)) {
      expect(baseline.themeCssVariables).not.toHaveProperty(key);
      expect(actual.themeCssVariables[key], key).toBe(value);
      delete resolvedActual.themeCssVariables[key];
    }
    expect(resolvedActual).toEqual(resolvedBaseline);
  });
});
