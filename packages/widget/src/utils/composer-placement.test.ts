import { describe, expect, it } from "vitest";

import {
  computeComposerLift,
  DEFAULT_ANCHOR_COMPOSER_TOP,
  DEFAULT_COMPOSER_GAP,
  parseAnchorFraction,
  resolveComposerPlacement,
} from "./composer-placement";
import type { AgentWidgetConfig } from "../types";

const config = (partial: Partial<AgentWidgetConfig>): AgentWidgetConfig =>
  partial as AgentWidgetConfig;

describe("resolveComposerPlacement", () => {
  it("defaults to block", () => {
    expect(resolveComposerPlacement(undefined, false)).toBe("block");
    expect(resolveComposerPlacement(config({}), false)).toBe("block");
    expect(
      resolveComposerPlacement(config({ composer: { placement: "block" } }), false)
    ).toBe("block");
  });

  it("resolves overlay only for the exact opt-in", () => {
    expect(
      resolveComposerPlacement(
        config({ composer: { placement: "overlay" } }),
        false
      )
    ).toBe("overlay");
    expect(
      resolveComposerPlacement(
        config({
          composer: { placement: "sticky" as unknown as "overlay" },
        }),
        false
      )
    ).toBe("block");
  });

  it("forces block in composer-bar mount mode", () => {
    expect(
      resolveComposerPlacement(
        config({ composer: { placement: "overlay" } }),
        true
      )
    ).toBe("block");
  });
});

describe("parseAnchorFraction", () => {
  it("accepts percentages strictly inside 0% and 100%", () => {
    expect(parseAnchorFraction("43%")).toBeCloseTo(0.43);
    expect(parseAnchorFraction("44 %")).toBeCloseTo(0.44);
    expect(parseAnchorFraction(" 47.5% ")).toBeCloseTo(0.475);
    expect(parseAnchorFraction(DEFAULT_ANCHOR_COMPOSER_TOP)).toBeCloseTo(0.44);
  });

  it("rejects everything else", () => {
    for (const raw of ["0%", "100%", "120%", "43", "43px", "", undefined]) {
      expect(parseAnchorFraction(raw)).toBeNull();
    }
  });
});

describe("computeComposerLift", () => {
  it("lands the footer top at the requested fraction of the column", () => {
    expect(
      computeComposerLift({ columnHeight: 800, footerHeight: 120, fraction: 0.43 })
    ).toBe(336);
  });

  it("floors at zero when the footer is taller than the free space", () => {
    expect(
      computeComposerLift({ columnHeight: 800, footerHeight: 600, fraction: 0.43 })
    ).toBe(0);
  });

  it("returns zero for a layoutless column", () => {
    expect(
      computeComposerLift({ columnHeight: 0, footerHeight: 0, fraction: 0.44 })
    ).toBe(0);
  });
});

describe("resolver-owned defaults", () => {
  it("exports the documented literals", () => {
    expect(DEFAULT_ANCHOR_COMPOSER_TOP).toBe("44%");
    expect(DEFAULT_COMPOSER_GAP).toBe("24px");
  });
});
