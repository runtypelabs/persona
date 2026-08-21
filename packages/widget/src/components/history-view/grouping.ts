/**
 * Client-side time grouping and relative-time formatting for the Messages list.
 *
 * Grouping never reorders: it walks the server order and opens a new group
 * whenever the resolved key changes, so an appended page merges into the
 * trailing group when its first item shares that group's key.
 */

import { fillTemplate, type ResolvedHistoryViewCopy } from "./copy";
import type { HistoryConversationSummary } from "../../internal/history-provider";

export type HistoryGroupKey =
  | "starred"
  | "today"
  | "yesterday"
  | "previous-7-days"
  | "previous-30-days"
  /** `month:<year>-<zero-based month>` */
  | `month:${string}`
  /** The single flat group `grouping: "none"` folds the time buckets into. */
  | "recent";

/** `features.history.grouping`. Starred rows keep their pinned group in both. */
export type HistoryGroupingMode = "time" | "none";

export interface HistoryGroup {
  key: HistoryGroupKey;
  label: string;
  items: HistoryConversationSummary[];
}

const DAY_MS = 86_400_000;

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Unparseable timestamps sort into the newest group rather than disappearing. */
function parse(timestamp: string, fallback: number): number {
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : fallback;
}

export function resolveGroupKey(
  updatedAt: string,
  nowMs: number
): HistoryGroupKey {
  const ms = parse(updatedAt, nowMs);
  const today = startOfLocalDay(nowMs);
  if (ms >= today) return "today";
  if (ms >= today - DAY_MS) return "yesterday";
  if (ms >= today - 7 * DAY_MS) return "previous-7-days";
  if (ms >= today - 30 * DAY_MS) return "previous-30-days";
  const date = new Date(ms);
  return `month:${date.getFullYear()}-${date.getMonth()}`;
}

export function formatGroupLabel(
  key: HistoryGroupKey,
  updatedAt: string,
  nowMs: number,
  copy: ResolvedHistoryViewCopy
): string {
  if (key === "today") return copy.groupToday;
  if (key === "yesterday") return copy.groupYesterday;
  if (key === "previous-7-days") return copy.groupPrevious7Days;
  if (key === "previous-30-days") return copy.groupPrevious30Days;
  const date = new Date(parse(updatedAt, nowMs));
  return fillTemplate(copy.groupMonthYear, {
    month: date.toLocaleString(undefined, { month: "long" }),
    year: date.getFullYear(),
  });
}

export function groupConversations(
  items: readonly HistoryConversationSummary[],
  nowMs: number,
  copy: ResolvedHistoryViewCopy,
  grouping: HistoryGroupingMode = "time"
): HistoryGroup[] {
  // Starred rows pin into one leading group (server order preserved within
  // it); everything else keeps the time grouping.
  const starred = items.filter((item) => item.starred);
  const groups: HistoryGroup[] =
    starred.length > 0
      ? [{ key: "starred", label: copy.groupStarred, items: starred }]
      : [];
  if (grouping === "none") {
    // One flat group. Its label exists for the list's accessible name only:
    // the view renders it sr-only, since the list heading directly above
    // already says the same thing.
    const rest = items.filter((item) => !item.starred);
    if (rest.length > 0) {
      groups.push({ key: "recent", label: copy.conversationsTitle, items: rest });
    }
    return groups;
  }
  for (const item of items) {
    if (item.starred) continue;
    const key = resolveGroupKey(item.updatedAt, nowMs);
    const current = groups[groups.length - 1];
    if (current && current.key === key) {
      current.items.push(item);
      continue;
    }
    groups.push({
      key,
      label: formatGroupLabel(key, item.updatedAt, nowMs, copy),
      items: [item],
    });
  }
  return groups;
}

/** Short, unwrapped, ambient form: "now", "12m", "2h", "3d", "5w", "2y". */
export function formatRelativeTime(
  updatedAt: string,
  nowMs: number,
  copy: ResolvedHistoryViewCopy
): string {
  const elapsed = Math.max(0, nowMs - parse(updatedAt, nowMs));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return copy.relativeNow;
  if (minutes < 60) return fillTemplate(copy.relativeMinutes, { value: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fillTemplate(copy.relativeHours, { value: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return fillTemplate(copy.relativeDays, { value: days });
  const weeks = Math.floor(days / 7);
  if (days < 365) return fillTemplate(copy.relativeWeeks, { value: weeks });
  return fillTemplate(copy.relativeYears, { value: Math.floor(days / 365) });
}

export function formatMessageCount(
  count: number,
  copy: ResolvedHistoryViewCopy
): string {
  if (count === 1) return copy.messageCountLabelOne;
  return fillTemplate(copy.messageCountLabel, { count });
}
