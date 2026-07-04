/**
 * Shared normalization of the public `contextMentions` config into trigger
 * channels. Both the core orchestrator (which paints affordance buttons) and the
 * lazy controller (which drives the menu/search) derive their channel list from
 * here, so the field-mapping and per-channel defaults live in exactly one place.
 *
 * Type-only imports of the public config types keep this module runtime-pure
 * (no DOM), matching `mention-trigger.ts`.
 */

import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionSource,
} from "../types";
import type { MentionTriggerPosition } from "./mention-trigger";

/**
 * A trigger channel normalized from config: the primary `@` channel (from the
 * legacy top-level fields) followed by any extra `triggers` channels. This is a
 * superset of what each consumer needs — the orchestrator reads the button
 * fields, the controller reads sources/search — and satisfies `MentionTriggerSpec`
 * so it can be passed straight to `parseAnyTrigger`. Channels are NOT filtered
 * here; each caller drops empty ones per its own policy.
 */
export type NormalizedMentionChannel = {
  trigger: string;
  position: MentionTriggerPosition;
  allowSpaces: boolean;
  sources: AgentWidgetContextMentionSource[];
  searchPlaceholder?: string;
  /** Primary defaults to shown; extra channels default to hidden (typed-only). */
  showButton: boolean;
  buttonIconName?: string;
  buttonTooltipText?: string;
};

export function normalizeMentionChannels(
  cfg: AgentWidgetContextMentionConfig
): NormalizedMentionChannel[] {
  const primary: NormalizedMentionChannel = {
    trigger: cfg.trigger ?? "@",
    position: cfg.triggerPosition ?? "anywhere",
    allowSpaces: false,
    sources: Array.isArray(cfg.sources) ? cfg.sources : [],
    searchPlaceholder: cfg.searchPlaceholder,
    showButton: cfg.showButton !== false,
    buttonIconName: cfg.buttonIconName,
    buttonTooltipText: cfg.buttonTooltipText,
  };
  const extra: NormalizedMentionChannel[] = (cfg.triggers ?? []).map((ch) => ({
    trigger: ch.trigger,
    position: ch.triggerPosition ?? "anywhere",
    allowSpaces: ch.allowSpaces ?? false,
    sources: Array.isArray(ch.sources) ? ch.sources : [],
    searchPlaceholder: ch.searchPlaceholder,
    // Extra channels (e.g. `/`) default to NO button to keep the composer's
    // action cluster uncluttered — typed-trigger only unless opted in.
    showButton: ch.showButton === true,
    buttonIconName: ch.buttonIconName,
    buttonTooltipText: ch.buttonTooltipText,
  }));
  return [primary, ...extra];
}
