import { describe, expect, it } from "vitest";
import {
  DEFAULT_BADGE_COLORS,
  getBadgeBorderColor,
  getBadgeColor,
} from "./event-stream-view";
import { createDarkTheme, createLightTheme, themeToCssVariables } from "../utils/theme";

/**
 * Contrast lock for the event-stream badge chips. The chip paints inline
 * `var(--persona-event-badge-*)` styles, so the pairs the theme pipeline emits
 * ARE the rendered colors inside any themed root; asserting on the emitted
 * variables is equivalent to a rendered-computed-style check without a
 * browser. Both schemes must hold every family at >= 4.5:1 (WCAG AA for the
 * 11px badge text).
 */

const FAMILIES = [
  "flow",
  "step",
  "reasoning",
  "tool",
  "agent",
  "error",
  "default",
] as const;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

function channelLuminance(byte: number): number {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const r = channelLuminance(parseInt(hex.slice(1, 3), 16));
  const g = channelLuminance(parseInt(hex.slice(3, 5), 16));
  const b = channelLuminance(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES = {
  light: () => themeToCssVariables(createLightTheme()),
  dark: () => themeToCssVariables(createDarkTheme()),
} as const;

describe("event-stream badge theming", () => {
  for (const [scheme, buildVars] of Object.entries(SCHEMES)) {
    it(`${scheme} scheme emits a >=4.5:1 pair for every badge family`, () => {
      const vars = buildVars();
      for (const family of FAMILIES) {
        const bg = vars[`--persona-event-badge-${family}-bg`];
        const fg = vars[`--persona-event-badge-${family}-fg`];
        expect(bg, `${family} bg`).toMatch(HEX6);
        expect(fg, `${family} fg`).toMatch(HEX6);
        const ratio = contrastRatio(bg, fg);
        expect(
          ratio,
          `${scheme} ${family}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("light pairs keep the pre-token rendered colors", () => {
    // The 4.x chips resolved these exact values inside a themed root; the
    // token pipeline must reproduce them so light mode is unchanged.
    const vars = SCHEMES.light();
    expect(vars["--persona-event-badge-flow-bg"]).toBe("#dcfce7");
    expect(vars["--persona-event-badge-flow-fg"]).toBe("#15803d");
    expect(vars["--persona-event-badge-tool-bg"]).toBe("#f3e8ff");
    expect(vars["--persona-event-badge-tool-fg"]).toBe("#6b21a8");
    expect(vars["--persona-event-badge-agent-bg"]).toBe("#ccfbf1");
    expect(vars["--persona-event-badge-agent-fg"]).toBe("#115e59");
    expect(vars["--persona-event-badge-default-bg"]).toBe("#f3f4f6");
    expect(vars["--persona-event-badge-default-fg"]).toBe("#4b5563");
  });

  it("dark pairs differ from light for every family", () => {
    const light = SCHEMES.light();
    const dark = SCHEMES.dark();
    for (const family of FAMILIES) {
      expect(
        dark[`--persona-event-badge-${family}-bg`],
        `${family} bg`
      ).not.toBe(light[`--persona-event-badge-${family}-bg`]);
    }
  });

  it("every default badge value references a variable both schemes emit", () => {
    const light = SCHEMES.light();
    const dark = SCHEMES.dark();
    const pairs = [...Object.values(DEFAULT_BADGE_COLORS), getBadgeColor("unmatched_type")];
    for (const pair of pairs) {
      for (const value of [pair.bg, pair.text]) {
        const match = /^var\((--persona-event-badge-[a-z]+-(?:bg|fg)), #[0-9a-f]{6}\)$/.exec(
          value
        );
        expect(match, value).not.toBeNull();
        const varName = match![1];
        expect(light[varName], `${varName} (light)`).toBeDefined();
        expect(dark[varName], `${varName} (dark)`).toBeDefined();
      }
    }
  });

  it("routes event types to families: prefixes, reasoning, and execution_error", () => {
    expect(getBadgeColor("flow_start")).toBe(DEFAULT_BADGE_COLORS.flow_);
    expect(getBadgeColor("tool_input_delta")).toBe(DEFAULT_BADGE_COLORS.tool_);
    expect(getBadgeColor("agent_turn_start")).toBe(DEFAULT_BADGE_COLORS.agent_);
    // reasoning_* must hit the reasoning family (the old `reason_` prefix
    // never matched `reasoning_start` and dropped it to the default pair).
    expect(getBadgeColor("reasoning_start")).toBe(DEFAULT_BADGE_COLORS.reasoning_);
    expect(getBadgeColor("error")).toBe(DEFAULT_BADGE_COLORS.error);
    expect(getBadgeColor("execution_error")).toBe(DEFAULT_BADGE_COLORS.error);
  });

  it("custom badgeColors: exact match beats prefix match", () => {
    const exact = { bg: "#111111", text: "#eeeeee" };
    const prefix = { bg: "#222222", text: "#dddddd" };
    const custom = { tool_: prefix, ["tool_start"]: exact };
    expect(getBadgeColor("tool_start", custom)).toBe(exact);
    expect(getBadgeColor("tool_complete", custom)).toBe(prefix);
  });

  it("border composition is valid CSS for hex and non-hex text colors", () => {
    // Bare 6-digit hex keeps the historical alpha suffix.
    expect(getBadgeBorderColor("#6b21a8")).toBe("#6b21a850");
    // var() refs (every default) and other CSS colors must compose via
    // color-mix; a bare suffix would produce an invalid, dropped declaration.
    expect(getBadgeBorderColor("var(--persona-event-badge-tool-fg, #6b21a8)")).toBe(
      "color-mix(in srgb, var(--persona-event-badge-tool-fg, #6b21a8) 31%, transparent)"
    );
    expect(getBadgeBorderColor("rgb(107, 33, 168)")).toBe(
      "color-mix(in srgb, rgb(107, 33, 168) 31%, transparent)"
    );
  });
});
