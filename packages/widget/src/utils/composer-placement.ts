import type { AgentWidgetConfig, ComposerPlacement } from "../types";

export const DEFAULT_ANCHOR_COMPOSER_TOP = "44%";
export const DEFAULT_COMPOSER_GAP = "24px";

/**
 * Resolver-owned default, not `defaults.ts`: `mergeWithDefaults` materializes
 * anything declared there (see `welcome.ts` header). Composer-bar mode owns
 * its own geometry and always resolves `"block"`.
 */
export const resolveComposerPlacement = (
  config: AgentWidgetConfig | undefined,
  composerBar: boolean
): ComposerPlacement =>
  composerBar || config?.composer?.placement !== "overlay" ? "block" : "overlay";

/** `"43%"` -> 0.43. Rejects anything that is not a finite percent in (0, 1). */
export const parseAnchorFraction = (raw: string | undefined): number | null => {
  if (typeof raw !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(raw);
  if (!match) return null;
  const fraction = Number(match[1]) / 100;
  return fraction > 0 && fraction < 1 ? fraction : null;
};

/**
 * Lift in px so the composer's top edge lands at `fraction` of the column:
 * `round(columnHeight * (1 - fraction)) - footerHeight`, floored at 0 so a
 * tall composer never pushes itself below the bottom edge. Layoutless
 * environments (jsdom) measure 0 and get 0.
 */
export const computeComposerLift = (args: {
  columnHeight: number;
  footerHeight: number;
  fraction: number;
}): number =>
  Math.max(
    0,
    Math.round(args.columnHeight * (1 - args.fraction)) - args.footerHeight
  );
