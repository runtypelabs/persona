/**
 * Default fuzzy matcher + static-source helper for context mentions.
 *
 * Pure and dependency-free so it can be exported for hosts (to filter
 * client-side sources) and unit-tested in isolation. Ranking tiers, best first:
 *   1. prefix       — label starts with the query
 *   2. word-boundary — a word inside the label starts with the query
 *   3. subsequence   — query chars appear in order anywhere in the label
 * Ties break by `recencyScore` (desc) then label (asc). An empty query returns
 * every item ordered by recency (recents/popular first).
 */

import type {
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

// Match tiers, best (lowest) first. Plain numbers rather than a const enum so
// the module stays isolatedModules-safe.
const TIER_PREFIX = 0;
const TIER_WORD_BOUNDARY = 1;
const TIER_SUBSEQUENCE = 2;
const TIER_NONE = 3;

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let n = 0;
  for (let h = 0; h < haystack.length && n < needle.length; h++) {
    if (haystack[h] === needle[n]) n++;
  }
  return n === needle.length;
}

function scoreItem(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l.startsWith(q)) return TIER_PREFIX;
  // Word boundaries: whitespace, hyphen, underscore, slash, dot, camelCase.
  const words = label.split(/[\s\-_/.]+|(?<=[a-z])(?=[A-Z])/);
  if (words.some((w) => w.toLowerCase().startsWith(q))) return TIER_WORD_BOUNDARY;
  if (isSubsequence(q, l)) return TIER_SUBSEQUENCE;
  return TIER_NONE;
}

function compareWithinTier(
  a: AgentWidgetContextMentionItem,
  b: AgentWidgetContextMentionItem
): number {
  const ra = a.recencyScore ?? 0;
  const rb = b.recencyScore ?? 0;
  if (rb !== ra) return rb - ra;
  return a.label.localeCompare(b.label);
}

/**
 * Filter + rank items for the current `@query`. An empty query keeps all items,
 * recency-ordered. Non-matching items are dropped.
 */
export function defaultMentionFilter(
  items: AgentWidgetContextMentionItem[],
  query: string
): AgentWidgetContextMentionItem[] {
  const q = query.trim();
  if (!q) {
    return [...items].sort(compareWithinTier);
  }
  const scored: { item: AgentWidgetContextMentionItem; tier: number }[] = [];
  for (const item of items) {
    const tier = scoreItem(item.label, q);
    if (tier !== TIER_NONE) scored.push({ item, tier });
  }
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return compareWithinTier(a.item, b.item);
  });
  return scored.map((s) => s.item);
}

/**
 * The easy path: a static, in-memory list filtered client-side with
 * {@link defaultMentionFilter}. Supply your own `resolve()` to turn a selected
 * item into a dispatch payload (lead with `llmAppend`).
 */
export function createStaticMentionSource(opts: {
  id: string;
  label: string;
  items: AgentWidgetContextMentionItem[];
  resolve: AgentWidgetContextMentionSource["resolve"];
  resolveOn?: "select" | "submit";
}): AgentWidgetContextMentionSource {
  return {
    id: opts.id,
    label: opts.label,
    resolveOn: opts.resolveOn,
    search: (query) => defaultMentionFilter(opts.items, query),
    resolve: opts.resolve,
  };
}
