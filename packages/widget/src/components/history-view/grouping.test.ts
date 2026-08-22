import { describe, expect, it } from "vitest";

import {
  formatGroupLabel,
  formatMessageCount,
  formatRelativeTime,
  groupConversations,
  resolveGroupKey,
} from "./grouping";
import { HISTORY_VIEW_COPY_DEFAULTS as COPY } from "./copy";
import type { HistoryConversationSummary } from "../../internal/history-provider";

const NOW = new Date(2026, 2, 15, 12, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const at = (offsetMs: number): string => new Date(NOW - offsetMs).toISOString();

const summary = (
  id: string,
  offsetMs: number
): HistoryConversationSummary => ({
  id,
  title: id,
  targetId: "t1",
  preview: null,
  messageCount: 2,
  createdAt: at(offsetMs),
  updatedAt: at(offsetMs),
});

describe("history grouping", () => {
  it("resolves calendar-relative group keys", () => {
    expect(resolveGroupKey(at(30 * MIN), NOW)).toBe("today");
    expect(resolveGroupKey(at(26 * HOUR), NOW)).toBe("yesterday");
    expect(resolveGroupKey(at(4 * DAY), NOW)).toBe("previous-7-days");
    expect(resolveGroupKey(at(20 * DAY), NOW)).toBe("previous-30-days");
    expect(resolveGroupKey(at(100 * DAY), NOW)).toMatch(/^month:\d{4}-\d{1,2}$/);
  });

  it("treats future and unparseable timestamps as today", () => {
    expect(resolveGroupKey(at(-5 * MIN), NOW)).toBe("today");
    expect(resolveGroupKey("not-a-date", NOW)).toBe("today");
  });

  it("keeps server order and opens a group only when the key changes", () => {
    const groups = groupConversations(
      [
        summary("a", 10 * MIN),
        summary("b", 2 * HOUR),
        summary("c", 26 * HOUR),
        summary("d", 4 * DAY),
      ],
      NOW,
      COPY
    );
    expect(groups.map((group) => group.key)).toEqual([
      "today",
      "yesterday",
      "previous-7-days",
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[0].label).toBe("Today");
  });

  it("folds the time buckets into one flat group with grouping none", () => {
    const groups = groupConversations(
      [
        summary("a", 10 * MIN),
        summary("b", 26 * HOUR),
        summary("c", 100 * DAY),
      ],
      NOW,
      COPY,
      "none"
    );
    expect(groups.map((group) => group.key)).toEqual(["recent"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    // The label exists for the list's accessible name; the view renders it
    // sr-only under the identical list heading.
    expect(groups[0].label).toBe("Conversations");
  });

  it("keeps the pinned starred group with grouping none", () => {
    const groups = groupConversations(
      [
        summary("a", 10 * MIN),
        { ...summary("pinned", 26 * HOUR), starred: true },
        summary("b", 4 * DAY),
      ],
      NOW,
      COPY,
      "none"
    );
    expect(groups.map((group) => group.key)).toEqual(["starred", "recent"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["pinned"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("returns only the starred group when every row is pinned under grouping none", () => {
    const groups = groupConversations(
      [{ ...summary("pinned", 26 * HOUR), starred: true }],
      NOW,
      COPY,
      "none"
    );
    expect(groups.map((group) => group.key)).toEqual(["starred"]);
  });

  it("does not reorder rows that arrive out of recency order", () => {
    const groups = groupConversations(
      [summary("old", 4 * DAY), summary("new", 10 * MIN)],
      NOW,
      COPY
    );
    expect(groups.map((group) => group.key)).toEqual([
      "previous-7-days",
      "today",
    ]);
  });

  it("labels month groups from the item timestamp", () => {
    const key = resolveGroupKey(at(100 * DAY), NOW);
    const label = formatGroupLabel(key, at(100 * DAY), NOW, COPY);
    expect(label).toMatch(/^[A-Za-z]+ \d{4}$/);
  });

  it("formats short unwrapped relative time", () => {
    expect(formatRelativeTime(at(20_000), NOW, COPY)).toBe("now");
    expect(formatRelativeTime(at(12 * MIN), NOW, COPY)).toBe("12m");
    expect(formatRelativeTime(at(2 * HOUR), NOW, COPY)).toBe("2h");
    expect(formatRelativeTime(at(3 * DAY), NOW, COPY)).toBe("3d");
    expect(formatRelativeTime(at(20 * DAY), NOW, COPY)).toBe("2w");
    expect(formatRelativeTime(at(800 * DAY), NOW, COPY)).toBe("2y");
  });

  it("pluralizes the message count", () => {
    expect(formatMessageCount(1, COPY)).toBe("1 message");
    expect(formatMessageCount(4, COPY)).toBe("4 messages");
  });
});
