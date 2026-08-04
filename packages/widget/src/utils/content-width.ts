import type { AgentWidgetConfig } from "../types";

/**
 * Resolver-owned default: every surveyed product caps the conversation
 * column (704 to 896px, modal value 768px,
 * "Hero width versus transcript width"). Kept out of defaults.ts so a
 * materialized value cannot override the composer-bar's own 720px fallback.
 * `"none"` opts out (applied as `max-width: none`).
 */
export const resolveContentMaxWidth = (
  config: AgentWidgetConfig | undefined,
  composerBar: boolean
): string =>
  config?.layout?.contentMaxWidth ??
  (composerBar
    ? config?.launcher?.composerBar?.contentMaxWidth ?? "720px"
    : "768px");
