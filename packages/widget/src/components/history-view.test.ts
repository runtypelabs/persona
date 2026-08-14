// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createHistoryView, type HistoryViewOptions } from "./history-view";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
  type DemoHistoryProvider,
} from "../internal/demo-history-provider";
import {
  HistoryProviderError,
  type HistoryProvider,
} from "../internal/history-provider";

const NOW = new Date(2026, 2, 15, 12, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const at = (offsetMs: number): string => new Date(NOW - offsetMs).toISOString();

const seed = (
  id: string,
  offsetMs: number,
  overrides: Partial<DemoHistoryConversationSeed> = {}
): DemoHistoryConversationSeed => ({
  id,
  title: `Session ${id}`,
  targetId: "t1",
  preview: `Preview for ${id}`,
  createdAt: at(offsetMs + MIN),
  updatedAt: at(offsetMs),
  messages: [
    { role: "user", content: `Question ${id}`, createdAt: at(offsetMs + MIN) },
    { role: "assistant", content: `Answer ${id}`, createdAt: at(offsetMs) },
  ],
  ...overrides,
});

const DEFAULT_SEEDS = [
  seed("a", 30 * MIN),
  seed("b", 2 * HOUR),
  seed("c", 26 * HOUR),
  seed("d", 4 * DAY),
];

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

type Mounted = {
  provider: DemoHistoryProvider;
  handle: ReturnType<typeof createHistoryView>;
  root: HTMLElement;
  onSelect: ReturnType<typeof vi.fn>;
  onStartNew: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onRequestDeleteConversation: ReturnType<typeof vi.fn>;
  onRequestClearHistory: ReturnType<typeof vi.fn>;
  onRequestResetIdentity: ReturnType<typeof vi.fn>;
};

const mounted: Mounted[] = [];

function mount(
  overrides: Partial<HistoryViewOptions> & {
    seeds?: DemoHistoryConversationSeed[];
    pageSize?: number;
    provider?: HistoryProvider;
  } = {}
): Mounted {
  const provider =
    (overrides.provider as DemoHistoryProvider | undefined) ??
    createDemoHistoryProvider({
      conversations: overrides.seeds ?? DEFAULT_SEEDS,
      pageSize: overrides.pageSize ?? 25,
      now: () => NOW,
    });

  const onSelect = vi.fn(async () => {});
  const onStartNew = vi.fn(async () => {});
  const onClose = vi.fn();
  const onRequestDeleteConversation = vi.fn(async () => "deleted" as const);
  const onRequestClearHistory = vi.fn(async () => "cleared" as const);
  const onRequestResetIdentity = vi.fn(async () => ({
    outcome: "reset" as const,
    remoteRevocationConfirmed: true,
  }));

  const handle = createHistoryView({
    provider,
    context: { scope: "browser" },
    targetId: "t1",
    presentation: "panel",
    showScopeStatus: true,
    activeConversationId: null,
    pageSize: overrides.pageSize ?? 25,
    now: () => NOW,
    onSelect,
    onStartNew,
    onClose,
    onRequestDeleteConversation,
    onRequestClearHistory,
    onRequestResetIdentity,
    ...overrides,
  });

  document.body.appendChild(handle.element);
  const record: Mounted = {
    provider,
    handle,
    root: handle.element,
    onSelect,
    onStartNew,
    onClose,
    onRequestDeleteConversation,
    onRequestClearHistory,
    onRequestResetIdentity,
  };
  mounted.push(record);
  return record;
}

const rows = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>(".persona-history-row"));

const rowFor = (root: HTMLElement, id: string): HTMLButtonElement => {
  const row = root.querySelector<HTMLButtonElement>(
    `[data-persona-history-conversation="${id}"]`
  );
  if (!row) throw new Error(`row ${id} not rendered`);
  return row;
};

const menuButtonFor = (root: HTMLElement, id: string): HTMLButtonElement => {
  const button = root.querySelector<HTMLButtonElement>(
    `[data-persona-history-focus="menu:${id}"]`
  );
  if (!button) throw new Error(`menu trigger ${id} not rendered`);
  return button;
};

const stateBlock = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>("[data-persona-history-state]");

const injectedHistoryCss = (): string =>
  document.querySelector(
    'style[data-persona-plugin-style="persona-history-view"]'
  )?.textContent ?? "";

const liveText = (root: HTMLElement): string =>
  root.querySelector("[data-persona-history-live-region]")?.textContent ?? "";

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.handle.destroy();
  document.body.replaceChildren();
});

describe("history view rows", () => {
  it("renders rows in server order with the title over the preview", async () => {
    const { root } = mount();
    await flush();

    const rendered = rows(root);
    expect(rendered).toHaveLength(4);
    expect(
      rendered.map((row) => row.getAttribute("data-persona-history-conversation"))
    ).toEqual(["a", "b", "c", "d"]);

    const first = rendered[0];
    const title = first.querySelector(".persona-history-row-title");
    const preview = first.querySelector(".persona-history-row-preview");
    const time = first.querySelector("time");

    expect(title?.textContent).toBe("Session a");
    expect(title?.classList.contains("persona-history-truncate")).toBe(true);
    expect(preview?.textContent).toBe("Preview for a");
    // Both lines are single-line and truncate; nothing wraps to a second line.
    expect(preview?.classList.contains("persona-history-truncate")).toBe(true);
    // Time is aligned to the title edge (same head row); preview follows below.
    expect(time?.parentElement?.classList.contains("persona-history-row-head")).toBe(
      true
    );
    expect(time?.getAttribute("datetime")).toBe(at(30 * MIN));
    expect(time?.textContent).toBe("30m");
    expect(title?.compareDocumentPosition(preview as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("keeps the message count quiet but available", async () => {
    const { root } = mount();
    await flush();
    const count = rowFor(root, "a").querySelector(".persona-history-row-count");
    expect(count?.textContent).toBe("2 messages");
    expect(count?.classList.contains("persona-history-sr-only")).toBe(true);
  });

  it("collapses a missing preview instead of reserving a line", async () => {
    const { root } = mount({
      seeds: [seed("a", 30 * MIN, { preview: null }), seed("b", 2 * HOUR)],
    });
    await flush();
    expect(
      rowFor(root, "a").querySelector(".persona-history-row-preview")
    ).toBeNull();
    expect(
      rowFor(root, "b").querySelector(".persona-history-row-preview")
    ).not.toBeNull();
  });

  it("renders text-only rows when no avatar source is provided", async () => {
    const { root } = mount();
    await flush();
    // No placeholder glyph: rows without a real mark drop the block entirely.
    expect(
      rowFor(root, "a").querySelector(".persona-history-row-avatar")
    ).toBeNull();
  });

  it("leads the row with the configured glyph avatar", async () => {
    const { root } = mount({ rowAvatar: "🛍️" });
    await flush();
    const avatar = rowFor(root, "a").querySelector<HTMLElement>(
      ".persona-history-row-avatar"
    );
    expect(avatar?.getAttribute("aria-hidden")).toBe("true");
    expect(avatar?.querySelector("img")).toBeNull();
    expect(avatar?.textContent).toBe("🛍️");
    // The avatar leads the text column.
    expect(
      avatar?.compareDocumentPosition(
        rowFor(root, "a").querySelector(".persona-history-row-body") as Node
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders a configured avatar URL as an image and a glyph as text", async () => {
    const { root } = mount({ rowAvatar: "https://example.com/a.png" });
    await flush();
    const image = rowFor(root, "a").querySelector<HTMLImageElement>(
      ".persona-history-row-avatar img"
    );
    expect(image?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(image?.getAttribute("alt")).toBe("");

    const glyph = mount({ rowAvatar: "🥐" });
    await flush();
    expect(
      rowFor(glyph.root, "a").querySelector(".persona-history-row-avatar")
        ?.textContent
    ).toBe("🥐");
  });

  it("drops the avatar block entirely when it is disabled", async () => {
    const { root } = mount({ rowAvatar: false });
    await flush();
    expect(root.querySelector(".persona-history-row-avatar")).toBeNull();
    expect(
      rowFor(root, "a").querySelector(".persona-history-row-body")
    ).not.toBeNull();
  });

  it("promotes the preview when a conversation has no server title", async () => {
    const { root } = mount({
      seeds: [
        seed("a", 30 * MIN, { title: "  " }),
        seed("b", 2 * HOUR, { title: "", preview: null }),
      ],
    });
    await flush();

    const first = rowFor(root, "a");
    expect(first.querySelector(".persona-history-row-title")?.textContent).toBe(
      "Preview for a"
    );
    expect(first.querySelector(".persona-history-row-preview")).toBeNull();
    // Nothing to promote: the title line stays empty rather than inventing text.
    expect(rowFor(root, "b").querySelector(".persona-history-row-title")?.textContent).toBe(
      ""
    );
  });

  it("marks the active row with aria-current and a class, not color alone", async () => {
    const { root, handle } = mount({ activeConversationId: "b" });
    await flush();

    expect(rowFor(root, "b").getAttribute("aria-current")).toBe("page");
    expect(rowFor(root, "b").classList.contains("persona-history-row--active")).toBe(
      true
    );
    expect(rowFor(root, "a").hasAttribute("aria-current")).toBe(false);

    handle.setActiveConversationId("a");
    expect(rowFor(root, "a").getAttribute("aria-current")).toBe("page");
    expect(rowFor(root, "b").hasAttribute("aria-current")).toBe(false);
  });
});

describe("history view list styling", () => {
  it("keeps the row menu trigger a hover-revealed sibling of the row button", async () => {
    const { root } = mount();
    await flush();
    const trigger = menuButtonFor(root, "a");
    expect(trigger.parentElement?.classList.contains("persona-history-item")).toBe(
      true
    );
    expect(trigger.closest(".persona-history-row")).toBeNull();

    const css = injectedHistoryCss();
    const hover = css.slice(css.indexOf("@media (hover: hover)"));
    expect(hover).toContain(
      ".persona-history-view button.persona-history-row-menu-button {\n    opacity: 0;"
    );
    expect(hover).toContain(
      ".persona-history-view li.persona-history-item:hover button.persona-history-row-menu-button"
    );
    expect(hover).toContain(
      ".persona-history-view li.persona-history-item:focus-within button.persona-history-row-menu-button"
    );
    // An open menu never fades out from under the pointer.
    expect(css).toContain(
      '.persona-history-view button.persona-history-row-menu-button[aria-expanded="true"] {\n  opacity: 1;\n}'
    );
  });

  it("keeps the trigger chip opaque and tapers the preview under it", async () => {
    mount();
    await flush();
    const css = injectedHistoryCss();
    // Wash composited twice over the opaque surface: row text never shows
    // through the hovered or menu-open chip.
    const chip = css.slice(
      css.indexOf(
        ".persona-history-view button.persona-history-row-menu-button:hover:not(:disabled)"
      )
    );
    const chipBlock = chip.slice(0, chip.indexOf("}"));
    expect(chipBlock).toContain('button.persona-history-row-menu-button[aria-expanded="true"]');
    expect(chipBlock.match(/var\(--persona-history-row-hover-bg\)/g)).toHaveLength(4);
    expect(chipBlock).toContain("var(--persona-history-surface-bg);");
    // The glyph keys to LIST text tokens, never the header icon token: it
    // rests muted on the surface and darkens to text on the chip.
    expect(chipBlock).toContain("color: var(--persona-text, #111827);");
    const rest = css.slice(
      css.indexOf(".persona-history-view button.persona-history-row-menu-button {")
    );
    expect(rest.slice(0, rest.indexOf("}"))).toContain(
      "color: var(--persona-text-muted, #6b7280);"
    );
    // The preview fades before the trigger zone in every state that shows the
    // trigger: hover reveal, focus, an open menu, and always on coarse pointers.
    expect(css).toContain(
      ".persona-history-view li.persona-history-item:hover .persona-history-row-preview"
    );
    expect(css).toContain(
      '.persona-history-view li.persona-history-item:has(button[aria-expanded="true"]) .persona-history-row-preview'
    );
    // Standard + -webkit- pairs in both the hover-state rule and the coarse
    // always-on rule: 4 mask-image declarations total.
    expect(
      css.match(/mask-image: linear-gradient\(to right, #000 calc\(100% - 84px\), transparent calc\(100% - 36px\)\)/g)
    ).toHaveLength(4);
    // The always-on pair lives in the shared coarse-pointer block.
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(coarse.slice(0, coarse.indexOf("\n}") + 2)).toContain(
      ".persona-history-view .persona-history-row-preview"
    );
  });

  it("separates rows with spacing, never dividers or borders", async () => {
    mount();
    await flush();
    const css = injectedHistoryCss();
    expect(css).not.toContain("li.persona-history-item + li.persona-history-item");
    expect(css).not.toContain("li.persona-history-item::after");
    expect(css).not.toContain("--persona-history-row-divider");
  });

  it("flattens the panel list and keeps the rail's date headings", async () => {
    const { root } = mount();
    await flush();
    // The headings stay in the DOM: the lists are still labelled by them.
    expect(root.querySelectorAll(".persona-history-group-heading")).toHaveLength(3);
    const css = injectedHistoryCss();
    const clipped = css.slice(
      css.indexOf(".persona-history-view .persona-history-sr-only")
    );
    // Only the panel's headings join the clipped selector list.
    expect(clipped.slice(0, clipped.indexOf("{"))).toContain(
      ".persona-history-view--panel .persona-history-group-heading"
    );
    expect(clipped.slice(0, clipped.indexOf("{"))).not.toContain("--rail");
    expect(css).toContain(".persona-history-view--panel .persona-history-group {\n  margin: 0 -16px;\n}");
  });

  it("strips the rail down to single-line titles on their own surface", async () => {
    mount({ presentation: "rail" });
    await flush();
    const css = injectedHistoryCss();

    // Avatar, preview and time are panel constructs.
    const hidden = css.slice(
      css.indexOf(".persona-history-view--rail .persona-history-row-avatar")
    );
    const hiddenBlock = hidden.slice(0, hidden.indexOf("}"));
    expect(hiddenBlock).toContain(".persona-history-view--rail .persona-history-row-avatar");
    expect(hiddenBlock).toContain(".persona-history-view--rail .persona-history-row-preview");
    expect(hiddenBlock).toContain(
      ".persona-history-view--rail time.persona-history-row-time"
    );
    expect(hiddenBlock).toContain("display: none");

    const row = css.slice(
      css.indexOf(".persona-history-view--rail button.persona-history-row {")
    );
    const rowBlock = row.slice(0, row.indexOf("}"));
    expect(rowBlock).toContain("min-height: 36px;");
    expect(rowBlock).toContain("padding: 6px 10px;");
    expect(rowBlock).toContain("margin: 0 6px;");
    expect(rowBlock).toContain("border-radius: 10px;");

    // The selection wash carries no edge marker in the rail.
    expect(css).toContain(
      '.persona-history-view--rail button.persona-history-row[aria-current="page"] {\n  box-shadow: none;\n}'
    );
    // The panel wash matches the rail surface, so the rail overrides it darker.
    expect(css).toContain(
      "--persona-history-row-active-bg: rgba(0, 0, 0, 0.08);"
    );
    // Its own sidebar surface, and no border: the host draws the divider.
    expect(css).toContain(
      "--persona-history-surface-bg: var(--persona-container, #f7f7f8);"
    );
    expect(css).not.toContain("border-left: 1px solid var(--persona-history-border)");
  });

  it("styles the rail's new-conversation action as a row above the list", async () => {
    const { root } = mount({ presentation: "rail" });
    await flush();
    // A leading compose glyph, not the panel pill's trailing arrow.
    const primary = root.querySelector<HTMLButtonElement>(".persona-history-new");
    expect(
      Array.from(primary!.querySelectorAll("svg path")).map((path) =>
        path.getAttribute("d")
      )
    ).toEqual(["M5 12h14", "M12 5v14"]);

    const css = injectedHistoryCss();
    const rail = css.slice(
      css.indexOf(".persona-history-view--rail button.persona-history-new {")
    );
    const block = rail.slice(0, rail.indexOf("}"));
    expect(block).toContain("min-height: 36px;");
    expect(block).toContain("padding: 6px 10px;");
    expect(block).toContain("margin: 0 6px;");
    expect(block).toContain("background: transparent;");
    // The pill's sticky placement is panel-only.
    expect(block).not.toContain("position: sticky;");
    // The compose glyph leads in the DOM; no CSS reorder is needed.
    expect(primary!.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });
});

describe("history view grouping and pagination", () => {
  it("groups rows client-side without reordering them", async () => {
    const { root } = mount();
    await flush();

    const groups = Array.from(
      root.querySelectorAll<HTMLElement>("[data-persona-history-group]")
    );
    expect(groups.map((g) => g.dataset.personaHistoryGroup)).toEqual([
      "today",
      "yesterday",
      "previous-7-days",
    ]);
    expect(
      groups[0].querySelector(".persona-history-group-heading")?.textContent
    ).toBe("Today");
    expect(groups[0].querySelectorAll(".persona-history-row")).toHaveLength(2);
    // Each group is a real list labelled by its heading.
    const list = groups[0].querySelector("ul");
    expect(list?.getAttribute("aria-labelledby")).toBe(
      groups[0].querySelector(".persona-history-group-heading")?.id
    );
  });

  it("merges the boundary group when load more appends a page", async () => {
    const { root } = mount({
      pageSize: 2,
      seeds: [
        seed("a", 10 * MIN),
        seed("b", 30 * MIN),
        seed("c", 2 * HOUR),
        seed("d", 26 * HOUR),
      ],
    });
    await flush();

    expect(rows(root)).toHaveLength(2);
    const loadMore = root.querySelector<HTMLButtonElement>(
      ".persona-history-load-more"
    );
    expect(loadMore?.textContent).toBe("Load more");

    loadMore?.click();
    await flush();

    const groups = Array.from(
      root.querySelectorAll<HTMLElement>("[data-persona-history-group]")
    );
    expect(groups.map((g) => g.dataset.personaHistoryGroup)).toEqual([
      "today",
      "yesterday",
    ]);
    expect(groups[0].querySelectorAll(".persona-history-row")).toHaveLength(3);
    expect(rows(root)).toHaveLength(4);
    expect(root.querySelector(".persona-history-load-more")).toBeNull();
  });

  it("keeps load more shape-stable and busy while a page is in flight", async () => {
    const { root, provider } = mount({
      pageSize: 2,
      seeds: [seed("a", 10 * MIN), seed("b", 30 * MIN), seed("c", 2 * HOUR)],
    });
    await flush();
    provider.setLatency(20);

    const loadMore = root.querySelector<HTMLButtonElement>(
      ".persona-history-load-more"
    );
    loadMore?.click();

    const busyButton = root.querySelector<HTMLButtonElement>(
      ".persona-history-load-more"
    );
    expect(busyButton?.getAttribute("aria-busy")).toBe("true");
    expect(busyButton?.textContent).toBe("Loading more conversations");
    // Stale rows stay put while the next page loads.
    expect(rows(root)).toHaveLength(2);

    provider.setLatency(0);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(rows(root)).toHaveLength(3);
  });
});

describe("history view row actions", () => {
  it("shows a per-row pending state until the select promise settles", async () => {
    let resolveSelect: (() => void) | undefined;
    const onSelect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSelect = resolve;
        })
    );
    const { root } = mount({ onSelect });
    await flush();

    rowFor(root, "a").click();
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(rowFor(root, "a").getAttribute("aria-busy")).toBe("true");
    expect(rowFor(root, "a").getAttribute("aria-disabled")).toBe("true");
    expect(rowFor(root, "b").getAttribute("aria-disabled")).toBe("true");
    expect(
      root
        .querySelector(".persona-history-new")
        ?.getAttribute("aria-disabled")
    ).toBe("true");

    // A second click while pending does not re-fire.
    rowFor(root, "b").click();
    expect(onSelect).toHaveBeenCalledTimes(1);

    resolveSelect?.();
    await flush();

    expect(rowFor(root, "a").hasAttribute("aria-busy")).toBe(false);
    expect(rowFor(root, "a").getAttribute("aria-current")).toBe("page");
  });

  it("keeps the list and shows a row-adjacent retry when select fails", async () => {
    const onSelect = vi
      .fn<(id: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue(undefined);
    const { root } = mount({ onSelect });
    await flush();

    rowFor(root, "a").click();
    await flush();

    expect(rows(root)).toHaveLength(4);
    const item = root.querySelector<HTMLElement>('[data-persona-history-item="a"]');
    const error = item?.querySelector<HTMLElement>(".persona-history-row-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toContain("Could not open that conversation.");

    error?.querySelector("button")?.click();
    await flush();
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(
      root.querySelector('[data-persona-history-item="a"] .persona-history-row-error')
    ).toBeNull();
  });

  it("opens a labelled overflow menu that is keyboard operable", async () => {
    const { root } = mount();
    await flush();

    const trigger = menuButtonFor(root, "a");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[role="menu"]')).toBeNull();

    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );

    const menu = root.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.getAttribute("aria-label")).toContain("Conversation options");
    const item = menu?.querySelector<HTMLElement>('[role="menuitem"]');
    expect(item?.textContent).toBe("Delete");
    expect(document.activeElement).toBe(item);
    expect(menuButtonFor(root, "a").getAttribute("aria-expanded")).toBe("true");

    item?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(root.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(menuButtonFor(root, "a"));
  });

  it("never renders a permanent trash affordance on the row", async () => {
    const { root } = mount();
    await flush();
    expect(root.querySelector(".persona-history-menu-item")).toBeNull();
    expect(root.querySelectorAll(".persona-history-row-menu-button")).toHaveLength(
      4
    );
  });

  it("removes the row when the shell reports a delete", async () => {
    const { root, onRequestDeleteConversation } = mount();
    await flush();

    menuButtonFor(root, "a").click();
    root.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    await flush();

    expect(onRequestDeleteConversation).toHaveBeenCalledWith("a");
    expect(rows(root)).toHaveLength(3);
    expect(liveText(root)).toBe("Conversation deleted.");
  });

  it("keeps the row when the shell reports a cancelled delete", async () => {
    const onRequestDeleteConversation = vi.fn(async () => "cancelled" as const);
    const { root } = mount({ onRequestDeleteConversation });
    await flush();

    menuButtonFor(root, "a").click();
    root.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    await flush();

    expect(rows(root)).toHaveLength(4);
    expect(liveText(root)).toBe("");
  });

  it("removes the row silently on not_found and shows a retry otherwise", async () => {
    const onRequestDeleteConversation = vi
      .fn<(id: string) => Promise<"deleted" | "cancelled">>()
      .mockRejectedValueOnce(
        new HistoryProviderError("not_found", "Conversation not found.")
      )
      .mockRejectedValueOnce(new Error("boom"));
    const { root } = mount({ onRequestDeleteConversation });
    await flush();

    menuButtonFor(root, "a").click();
    root.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    await flush();
    expect(rows(root)).toHaveLength(3);
    expect(root.querySelector(".persona-history-row-error")).toBeNull();
    expect(liveText(root)).toBe("");

    menuButtonFor(root, "b").click();
    root.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    await flush();
    expect(rows(root)).toHaveLength(3);
    expect(
      root.querySelector('[data-persona-history-item="b"] .persona-history-row-error')
        ?.textContent
    ).toContain("Could not delete that conversation.");
  });
});

describe("history view list states", () => {
  it("renders three row-shaped skeletons with no fake text while loading", () => {
    const { root } = mount();
    const block = stateBlock(root);
    expect(block?.dataset.personaHistoryState).toBe("loading");
    expect(block?.getAttribute("role")).toBe("status");
    expect(block?.getAttribute("aria-label")).toBe("Loading conversations");
    expect(block?.querySelectorAll(".persona-history-skeleton-row")).toHaveLength(3);
    expect(block?.textContent).toBe("");
  });

  it("renders the empty state and hides delete-all when there is nothing to delete", async () => {
    const { root } = mount({ seeds: [] });
    await flush();

    const block = stateBlock(root);
    expect(block?.dataset.personaHistoryState).toBe("empty");
    expect(block?.textContent).toContain("No conversations yet");
    expect(rows(root)).toHaveLength(0);
    // The primary action stays prominent.
    expect(root.querySelector(".persona-history-new")).not.toBeNull();
    expect(
      root.querySelector<HTMLElement>(".persona-history-clear")?.hidden
    ).toBe(true);
  });

  it("renders a retryable error with an adjacent retry", async () => {
    const { root, provider } = mount();
    await flush();
    provider.setFailure("list", { code: "unavailable" });
    root
      .querySelector<HTMLButtonElement>('[data-persona-history-focus="close"]')
      ?.blur();

    const { handle } = mounted[mounted.length - 1];
    handle.refresh();
    await flush();

    const block = stateBlock(root);
    expect(block?.dataset.personaHistoryState).toBe("error");
    expect(block?.getAttribute("role")).toBe("alert");
    expect(block?.textContent).toContain("Conversation history is unavailable");

    provider.clearFailures();
    block?.querySelector<HTMLButtonElement>("button")?.click();
    await flush();
    expect(rows(root)).toHaveLength(4);
  });

  it("renders the rate-limited soft state with its retry-after seconds", async () => {
    const { root, provider, handle } = mount();
    await flush();
    provider.setFailure("list", { code: "rate_limited", retryAfterSeconds: 30 });
    handle.refresh();
    await flush();

    const block = stateBlock(root);
    expect(block?.dataset.personaHistoryState).toBe("rate_limited");
    expect(block?.textContent).toContain("You can try again in 30 seconds.");
  });

  it("offers no retry for an unsupported scope", async () => {
    const { root } = mount({ context: { scope: "verified-user" } });
    await flush();

    const block = stateBlock(root);
    expect(block?.dataset.personaHistoryState).toBe("error");
    expect(block?.textContent).toContain("Account history is unavailable");
    expect(block?.querySelector("button")).toBeNull();
  });

  it("recovers from new_conversation_required through onStartNew", async () => {
    const { root, handle, onStartNew } = mount();
    await flush();

    handle.setNewConversationRequired(true);
    const block = stateBlock(root);
    expect(block?.dataset.personaHistoryState).toBe("new_conversation_required");
    const action = block?.querySelector<HTMLButtonElement>("button");
    expect(action?.textContent).toBe("New conversation");

    action?.click();
    await flush();
    expect(onStartNew).toHaveBeenCalledTimes(1);
    expect(stateBlock(root)).toBeNull();
  });

  it("keeps the top-bar controls in place across every list state", async () => {
    const { root, provider, handle } = mount();
    await flush();
    const controls = () =>
      Array.from(
        root.querySelectorAll(".persona-history-topbar button")
      ).map((button) => button.getAttribute("aria-label"));
    const before = controls();

    provider.setFailure("list", { code: "unavailable" });
    handle.refresh();
    await flush();
    expect(controls()).toEqual(before);

    provider.clearFailures();
    handle.refresh();
    await flush();
    expect(controls()).toEqual(before);
  });
});

describe("history view scope status", () => {
  it("collapses the browser-only scope to one body caption with an sr-only description", async () => {
    const { root } = mount();
    await flush();

    expect(root.querySelector(".persona-history-scope-title")?.textContent).toBe(
      "Messages on this device"
    );
    const block = root.querySelector<HTMLElement>(".persona-history-scope-alert");
    expect(block?.dataset.personaHistoryIdentity).toBe("browser_only");
    expect(block?.textContent).toContain("separate history");
    expect(block?.hasAttribute("role")).toBe(false);
    // No second visual band: the sentence is reachable only through the caption.
    expect(block?.dataset.personaHistoryScopeTone).toBe("ambient");
    const line = root.querySelector<HTMLElement>(".persona-history-scope")!;
    const describedBy = line.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(
      root.querySelector(`#${describedBy}`)?.classList.contains(
        "persona-history-scope-description"
      )
    ).toBe(true);
  });

  it("keeps every scope surface below the bar, above the list", async () => {
    const { root, provider } = mount();
    await flush();
    const body = root.querySelector<HTMLElement>(".persona-history-body")!;
    const bar = root.querySelector<HTMLElement>(".persona-history-topbar")!;
    const line = root.querySelector<HTMLElement>(".persona-history-scope")!;
    const block = root.querySelector<HTMLElement>(".persona-history-scope-alert")!;

    expect(bar.contains(line)).toBe(false);
    expect(body.contains(line)).toBe(true);
    expect(body.contains(block)).toBe(true);
    expect(line.hidden).toBe(false);
    expect(
      line.compareDocumentPosition(
        root.querySelector(".persona-history-list-region") as Node
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    // Actionable states speak through the block; the caption would repeat it.
    provider.setIdentityStatus({
      state: "authentication_required",
      reason: "invalid_identity_proof",
    });
    await flush();
    expect(line.hidden).toBe(true);
    expect(
      block.querySelector(".persona-history-scope-alert-title")?.textContent
    ).toBe("Sign in to see your messages");
  });

  it("keeps the verified scope ambient and restores the band for attention states", async () => {
    const { root, provider } = mount();
    await flush();
    const block = root.querySelector<HTMLElement>(".persona-history-scope-alert")!;
    const line = root.querySelector<HTMLElement>(".persona-history-scope")!;

    provider.setIdentityStatus({ state: "verified" });
    await flush();
    expect(block.dataset.personaHistoryScopeTone).toBe("ambient");
    expect(line.hasAttribute("aria-describedby")).toBe(true);

    // Actionable states stay prominent and drop the duplicate description link.
    provider.setIdentityStatus({ state: "verifying" });
    await flush();
    expect(block.dataset.personaHistoryScopeTone).toBe("attention");
    expect(line.hasAttribute("aria-describedby")).toBe(false);

    provider.setIdentityStatus({ state: "identity_provider_failed" });
    await flush();
    expect(block.dataset.personaHistoryScopeTone).toBe("attention");
    expect(line.hasAttribute("aria-describedby")).toBe(false);
  });

  it("announces an identity transition once and not on re-render", async () => {
    const { root, provider, handle } = mount();
    await flush();
    const subtitle = root.querySelector(".persona-history-scope-title");

    provider.setIdentityStatus({ state: "verifying" });
    expect(
      root
        .querySelector(".persona-history-scope-alert")
        ?.getAttribute("role")
    ).toBe("status");
    expect(subtitle?.textContent).toBe("Checking your account");
    // A progress state speaks through its own status region, not the announcer.
    await flush();
    expect(liveText(root)).toBe("");

    provider.setIdentityStatus({ state: "verified" });
    await flush();
    expect(subtitle?.textContent).toBe("Available across signed-in devices");
    expect(liveText(root)).toBe("Available across signed-in devices");
    // Same node patched in place: a stable subtitle cannot re-announce.
    expect(root.querySelector(".persona-history-scope-title")).toBe(subtitle);

    handle.refresh();
    await flush();
    expect(root.querySelector(".persona-history-scope-title")).toBe(subtitle);
  });

  it("explains an identity failure and offers a retry", async () => {
    const { root, provider } = mount();
    await flush();

    provider.setIdentityStatus({
      state: "authentication_required",
      reason: "invalid_identity_proof",
    });
    const block = root.querySelector<HTMLElement>(".persona-history-scope-alert");
    expect(block?.dataset.personaHistoryScopeTone).toBe("attention");
    expect(block?.textContent).toContain("Sign in again to load account history.");
    expect(
      block?.querySelector<HTMLElement>(
        '[data-persona-history-focus="identity-retry"]'
      )?.textContent
    ).toBe("Try again");
  });

  it("omits the scope status entirely when disabled", async () => {
    const { root } = mount({ showScopeStatus: false });
    await flush();
    expect(root.querySelector(".persona-history-scope")).toBeNull();
    expect(root.querySelector(".persona-history-scope-alert")).toBeNull();
  });
});

describe("history view chrome and destructive actions", () => {
  it("meets the top-bar anatomy contract", async () => {
    const { root, onClose, onStartNew } = mount();
    await flush();

    const topbar = root.querySelector<HTMLElement>(".persona-history-topbar");
    expect(topbar?.querySelector("h2")?.textContent).toBe("Messages");

    const back = root.querySelector<HTMLButtonElement>(
      '[data-persona-history-focus="close"]'
    );
    expect(back?.getAttribute("aria-label")).toBe("Back to conversation");
    back?.click();
    expect(onClose).toHaveBeenCalledTimes(1);

    const newIcon = topbar?.querySelector<HTMLButtonElement>(
      '[data-persona-history-focus="new-icon"]'
    );
    expect(newIcon?.getAttribute("aria-label")).toBe("New conversation");
    newIcon?.click();
    await flush();
    expect(onStartNew).toHaveBeenCalledTimes(1);

    // Every pointer control carries the 44px target class.
    for (const button of Array.from(
      root.querySelectorAll(".persona-history-topbar button")
    )) {
      expect(button.classList.contains("persona-history-icon-button")).toBe(true);
    }
  });

  it("labels the rail close control differently from the panel back control", async () => {
    const { root } = mount({ presentation: "rail", collapsible: false });
    await flush();
    expect(root.classList.contains("persona-history-view--rail")).toBe(true);
    expect(root.dataset.personaHistoryPresentation).toBe("rail");
    expect(
      root
        .querySelector('[data-persona-history-focus="close"]')
        ?.getAttribute("aria-label")
    ).toBe("Close conversation list");
  });

  it("turns the collapsible rail's leading control into a collapse toggle", async () => {
    const onToggleCollapse = vi.fn();
    const { root, handle } = mount({ presentation: "rail", onToggleCollapse });
    await flush();
    const toggle = root.querySelector<HTMLButtonElement>(
      '[data-persona-history-focus="collapse"]'
    )!;
    expect(toggle).not.toBeNull();
    expect(root.querySelector('[data-persona-history-focus="close"]')).toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe("Collapse conversation list");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Controls the body region it hides, which carries the list.
    const body = root.querySelector<HTMLElement>(".persona-history-body")!;
    expect(toggle.getAttribute("aria-controls")).toBe(body.id);
    expect(body.id).not.toBe("");
    // Lucide PanelLeft: the rounded plate plus its divider.
    expect(toggle.querySelector("rect")).not.toBeNull();
    expect(toggle.querySelector("path")?.getAttribute("d")).toBe("M9 3v18");

    toggle.click();
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    // Panel keeps the back arrow and the close focus key untouched.
    handle.setPresentation("panel");
    await flush();
    const back = root.querySelector<HTMLButtonElement>(
      '[data-persona-history-focus="close"]'
    )!;
    expect(back.getAttribute("aria-label")).toBe("Back to conversation");
    expect(back.hasAttribute("aria-expanded")).toBe(false);
    expect(back.querySelector("rect")).toBeNull();
  });

  it("keeps the rail's close control when collapse is turned off", async () => {
    const onClose = vi.fn();
    const { root } = mount({
      presentation: "rail",
      collapsible: false,
      onClose,
    });
    await flush();
    expect(root.querySelector('[data-persona-history-focus="collapse"]')).toBeNull();
    root
      .querySelector<HTMLButtonElement>('[data-persona-history-focus="close"]')!
      .click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stamps the collapsed rail treatment and relabels its toggle", async () => {
    const { root, handle } = mount({ presentation: "rail", collapsed: true });
    await flush();
    const toggle = () =>
      root.querySelector<HTMLButtonElement>(
        '[data-persona-history-focus="collapse"]'
      )!;
    expect(root.classList.contains("persona-history-view--rail-collapsed")).toBe(
      true
    );
    expect(toggle().getAttribute("aria-label")).toBe("Expand conversation list");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    handle.setCollapsed(false);
    expect(root.classList.contains("persona-history-view--rail-collapsed")).toBe(
      false
    );
    expect(toggle().getAttribute("aria-label")).toBe("Collapse conversation list");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");

    // Panel never wears the treatment, whatever the last rail state was.
    handle.setCollapsed(true);
    handle.setPresentation("panel");
    await flush();
    expect(root.classList.contains("persona-history-view--rail-collapsed")).toBe(
      false
    );
  });

  it("hides everything but the two icons in the collapsed rail", async () => {
    mount({ presentation: "rail", collapsed: true });
    await flush();
    const css = injectedHistoryCss();
    const hidden = css.slice(
      css.indexOf(
        ".persona-history-view--rail-collapsed .persona-history-heading-group"
      )
    );
    const hiddenBlock = hidden.slice(0, hidden.indexOf("}"));
    // The list, the scope caption and the footer are all body children.
    expect(hiddenBlock).toContain(
      ".persona-history-view--rail-collapsed .persona-history-body > :not(.persona-history-new)"
    );
    expect(hiddenBlock).toContain("display: none;");
    // The host's width animation is a rule, so it can honor reduced motion.
    expect(css).toContain(
      ".persona-history-rail-host {\n  transition: flex-basis"
    );
    expect(css.slice(css.indexOf("@media (prefers-reduced-motion"))).toContain(
      ".persona-history-rail-host { transition: none; }"
    );
    // The new-conversation row squares off into a centered icon button.
    const row = css.slice(
      css.indexOf(
        ".persona-history-view--rail-collapsed button.persona-history-new {"
      )
    );
    const rowBlock = row.slice(0, row.indexOf("}"));
    expect(rowBlock).toContain("width: 36px;");
    expect(rowBlock).toContain("margin: 0 auto;");
    expect(css).toContain(
      ".persona-history-view--rail-collapsed button.persona-history-new span {\n  display: none;\n}"
    );
  });

  it("carries one new-conversation control per presentation", async () => {
    const { root, handle } = mount({ presentation: "rail" });
    await flush();
    const barIcon = () =>
      root.querySelector<HTMLButtonElement>(
        '.persona-history-topbar [data-persona-history-focus="new-icon"]'
      );
    // The rail's body row is the only one; the panel bar carries the icon.
    expect(barIcon()).toBeNull();
    expect(root.querySelector(".persona-history-new")).not.toBeNull();

    handle.setPresentation("panel");
    await flush();
    const icon = barIcon();
    expect(icon).not.toBeNull();
    // Restored as the trailing child, so the heading stays centered.
    expect(icon?.previousElementSibling?.className).toBe(
      "persona-history-heading-group"
    );
    expect(icon?.nextElementSibling).toBeNull();

    handle.setPresentation("rail");
    await flush();
    expect(barIcon()).toBeNull();
  });

  it("gives the rail bar only the tracks it fills", async () => {
    mount({ presentation: "rail" });
    await flush();
    const css = injectedHistoryCss();
    const rail = css.slice(
      css.indexOf(".persona-history-view--rail .persona-history-topbar {")
    );
    // Identity leads, the toggle takes the trailing (inner) track, sized to it.
    expect(rail.slice(0, rail.indexOf("}"))).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;"
    );
    const mirrored = css.slice(
      css.indexOf(".persona-history-view--rail-right .persona-history-topbar {")
    );
    expect(mirrored.slice(0, mirrored.indexOf("}"))).toContain(
      "grid-template-columns: auto minmax(0, 1fr);"
    );
    // The heading takes the rows' 16px text inset on whichever edge it leads.
    expect(css).toContain(
      ".persona-history-view--rail .persona-history-heading-group {\n  text-align: left;"
    );
    // The panel and shell bars keep the third track for their icon.
    expect(css).toContain("grid-template-columns: 44px minmax(0, 1fr) 44px;");
  });

  it("sizes the rail toggle to 36px with a coarse-pointer 44px floor", async () => {
    mount({ presentation: "rail" });
    await flush();
    const css = injectedHistoryCss();
    const selector =
      ".persona-history-view--rail .persona-history-topbar button.persona-history-icon-button {";
    const box = css.slice(css.indexOf(selector));
    const boxBlock = box.slice(0, box.indexOf("}"));
    for (const property of ["width", "height", "min-width", "min-height"]) {
      expect(boxBlock).toContain(`${property}: 36px;`);
    }
    // The panel and shell bars keep the 44px header control box.
    const shared = css.slice(
      css.indexOf(".persona-history-view button.persona-history-icon-button,")
    );
    expect(shared.slice(0, shared.indexOf("}"))).toContain("width: 44px;");
    // Touch has no hover to aim with, so the target goes back to 44px.
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(coarse).toContain(`  ${selector}`);
    expect(coarse.slice(0, coarse.indexOf("\n}"))).toContain("width: 44px;");
  });

  it("puts the rail's collapse toggle on the edge facing the conversation", async () => {
    const { root, handle } = mount({ presentation: "rail" });
    await flush();
    const bar = root.querySelector<HTMLElement>(".persona-history-topbar")!;
    const order = () =>
      Array.from(bar.children).map((child) => child.className.split(" ")[0]);
    // Rail on the left: heading first, toggle on the trailing inner edge.
    expect(order()).toEqual([
      "persona-history-heading-group",
      "persona-history-icon-button",
    ]);
    expect(bar.lastElementChild?.getAttribute("data-persona-history-focus")).toBe(
      "collapse"
    );
    expect(root.classList.contains("persona-history-view--rail-right")).toBe(
      false
    );

    // Panel keeps the back arrow leading and the icon trailing.
    handle.setPresentation("panel");
    await flush();
    expect(order()).toEqual([
      "persona-history-icon-button",
      "persona-history-heading-group",
      "persona-history-icon-button",
    ]);
    expect(bar.firstElementChild?.getAttribute("data-persona-history-focus")).toBe(
      "close"
    );
  });

  it("mirrors the rail bar when the rail docks on the right", async () => {
    const { root, handle } = mount({ presentation: "rail", railSide: "right" });
    await flush();
    const bar = root.querySelector<HTMLElement>(".persona-history-topbar")!;
    // Inner edge faces left, so the toggle leads and the heading trails.
    expect(bar.firstElementChild?.getAttribute("data-persona-history-focus")).toBe(
      "collapse"
    );
    expect(bar.lastElementChild?.className).toBe("persona-history-heading-group");
    expect(root.classList.contains("persona-history-view--rail-right")).toBe(true);

    handle.setRailSide("left");
    expect(bar.lastElementChild?.getAttribute("data-persona-history-focus")).toBe(
      "collapse"
    );
    expect(root.classList.contains("persona-history-view--rail-right")).toBe(
      false
    );

    // Panel never wears the mirrored treatment.
    handle.setRailSide("right");
    handle.setPresentation("panel");
    await flush();
    expect(root.classList.contains("persona-history-view--rail-right")).toBe(
      false
    );
    expect(bar.firstElementChild?.getAttribute("data-persona-history-focus")).toBe(
      "close"
    );
  });

  it("renders a host brand in the rail header and keeps the title for the name", async () => {
    const seen: Array<{ collapsed: boolean; defaultTitle: string }> = [];
    const renderRailHeader = vi.fn((context: { collapsed: boolean; defaultTitle: string }) => {
      seen.push(context);
      // Unlabelled content: the region's name must still come from the h2.
      return context.collapsed ? null : document.createElement("img");
    });
    const { root, handle } = mount({ presentation: "rail", renderRailHeader });
    await flush();

    const group = root.querySelector<HTMLElement>(
      ".persona-history-heading-group"
    )!;
    const title = root.querySelector<HTMLElement>(".persona-history-title")!;
    expect(seen).toEqual([{ collapsed: false, defaultTitle: "Messages" }]);
    expect(group.querySelector("img")).not.toBeNull();
    expect(title.classList.contains("persona-history-sr-only")).toBe(true);
    // aria-labelledby still resolves to a non-empty accessible name.
    const labelledBy = root.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)?.textContent).toBe("Messages");

    // Collapsed re-invokes the slot; null empties the identity area.
    handle.setCollapsed(true);
    expect(seen[1]).toEqual({ collapsed: true, defaultTitle: "Messages" });
    expect(group.querySelector("img")).toBeNull();
    expect(title.classList.contains("persona-history-sr-only")).toBe(true);

    // Panel ignores the slot: the plain title comes back, visible.
    handle.setPresentation("panel");
    await flush();
    expect(renderRailHeader).toHaveBeenCalledTimes(2);
    expect(title.classList.contains("persona-history-sr-only")).toBe(false);
    expect(group.querySelector("img")).toBeNull();
  });

  it("falls back to the plain title when the rail brand renderer throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const renderRailHeader = vi.fn(() => {
      throw new Error("brand blew up");
    });
    const { root, handle } = mount({ presentation: "rail", renderRailHeader });
    await flush();
    const title = root.querySelector<HTMLElement>(".persona-history-title")!;
    expect(title.textContent).toBe("Messages");
    expect(title.classList.contains("persona-history-sr-only")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);

    // Warned once, not on every collapse.
    handle.setCollapsed(true);
    expect(renderRailHeader).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("composes a brand declaration into the heading and the collapsed toggle", async () => {
    const railBrand = vi.fn((collapsed: boolean) => {
      const mark = document.createElement("i");
      mark.dataset.face = collapsed ? "collapsed" : "expanded";
      return mark;
    });
    const { root, handle } = mount({ presentation: "rail", railBrand });
    await flush();

    // Expanded heading: the mark leads, the view title follows as wordmark.
    const brand = root.querySelector<HTMLElement>(
      ".persona-history-heading-brand"
    )!;
    expect(brand.getAttribute("aria-hidden")).toBe("true");
    expect(
      brand.querySelector<HTMLElement>(".persona-history-brand-mark i")?.dataset
        .face
    ).toBe("expanded");
    expect(brand.querySelector(".persona-history-wordmark")?.textContent).toBe(
      "Messages"
    );
    // The heading stays for the region's accessible name.
    const title = root.querySelector<HTMLElement>(".persona-history-title")!;
    expect(title.classList.contains("persona-history-sr-only")).toBe(true);
    expect(
      document.getElementById(root.getAttribute("aria-labelledby")!)?.textContent
    ).toBe("Messages");

    // Collapsed rest face: the mark sits in the toggle beside its glyph.
    const toggle = root.querySelector<HTMLElement>(
      '[data-persona-history-focus="collapse"]'
    )!;
    expect(toggle.classList.contains("persona-history-back--branded")).toBe(true);
    const face = () =>
      toggle.querySelector<HTMLElement>(".persona-history-toggle-brand i")
        ?.dataset.face;
    expect(face()).toBe("collapsed");
    expect(toggle.querySelector("svg")).not.toBeNull();

    // One call per face: neither ctx changes with the collapsed state.
    handle.setCollapsed(true);
    handle.setCollapsed(false);
    expect(face()).toBe("collapsed");
    expect(toggle.querySelector("svg")).not.toBeNull();
    expect(root.querySelector(".persona-history-heading-brand")).not.toBeNull();
    expect(railBrand).toHaveBeenCalledTimes(2);
  });

  it("keeps the rail brand out of the panel and lets renderHeader outrank it", async () => {
    const railBrand = vi.fn(() => document.createElement("i"));
    const renderRailHeader = vi.fn(() => {
      const slot = document.createElement("b");
      slot.dataset.slot = "";
      return slot;
    });
    const { root, handle } = mount({
      presentation: "rail",
      railBrand,
      renderRailHeader,
    });
    await flush();
    const group = root.querySelector<HTMLElement>(
      ".persona-history-heading-group"
    )!;
    // Full override: the heading area is the slot's, not the brand default.
    expect(group.querySelector("[data-slot]")).not.toBeNull();
    expect(group.querySelector(".persona-history-heading-brand")).toBeNull();
    // The collapsed face is the brand's alone, so it is still there.
    const toggle = root.querySelector<HTMLElement>(
      '[data-persona-history-focus="collapse"]'
    )!;
    expect(toggle.querySelector(".persona-history-toggle-brand")).not.toBeNull();

    handle.setPresentation("panel");
    await flush();
    expect(root.querySelector(".persona-history-toggle-brand")).toBeNull();
    expect(root.querySelector(".persona-history-heading-brand")).toBeNull();
    expect(
      root
        .querySelector(".persona-history-back")
        ?.classList.contains("persona-history-back--branded")
    ).toBe(false);

    // Back in the rail the same face returns without a second brand call.
    handle.setPresentation("rail");
    await flush();
    expect(root.querySelector(".persona-history-toggle-brand")).not.toBeNull();
    expect(railBrand).toHaveBeenCalledTimes(1);
  });

  it("leaves the toggle glyph alone when no brand is configured", async () => {
    const { root } = mount({ presentation: "rail" });
    await flush();
    const toggle = root.querySelector<HTMLElement>(
      '[data-persona-history-focus="collapse"]'
    )!;
    expect(toggle.querySelector(".persona-history-toggle-brand")).toBeNull();
    expect(toggle.classList.contains("persona-history-back--branded")).toBe(
      false
    );
  });

  it("swaps the collapsed toggle's brand face for the glyph on hover and focus", async () => {
    mount({ presentation: "rail", railBrand: () => document.createElement("i") });
    await flush();
    const css = injectedHistoryCss();
    const branded =
      ".persona-history-view--rail-collapsed .persona-history-back--branded";
    // At rest the mark shows and the glyph waits under it.
    expect(css).toContain(
      `${branded} .persona-history-toggle-brand {\n  display: flex;\n}`
    );
    expect(css).toContain(`${branded} > svg {\n  display: none;\n}`);
    expect(css).toContain(
      `${branded}:hover .persona-history-toggle-brand,\n${branded}:focus-visible .persona-history-toggle-brand {\n  display: none;\n}`
    );
    expect(css).toContain(
      `${branded}:hover > svg,\n${branded}:focus-visible > svg {\n  display: block;\n}`
    );
    // Touch has no hover, so the glyph is the only face there.
    const coarse = css.slice(css.lastIndexOf("@media (pointer: coarse)"));
    expect(coarse).toContain(
      `  ${branded} .persona-history-toggle-brand {\n    display: none;\n  }`
    );
    expect(coarse).toContain(`  ${branded} > svg {\n    display: block;\n  }`);
  });

  it("runs the primary new-conversation action from a pill pinned below the list", async () => {
    const { root, onStartNew } = mount();
    await flush();
    const primary = root.querySelector<HTMLButtonElement>(".persona-history-new");
    expect(primary?.textContent).toContain("New conversation");
    // DOM order is unchanged; flex order and sticky do the placement.
    expect(
      primary?.compareDocumentPosition(
        root.querySelector(".persona-history-list-region") as Node
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const css = injectedHistoryCss();
    const pill = css.slice(
      css.indexOf(".persona-history-view--panel button.persona-history-new {")
    );
    const block = pill.slice(0, pill.indexOf("}"));
    expect(block).toContain("order: 1;");
    expect(block).toContain("position: sticky;");
    expect(block).toContain("align-self: center;");
    expect(block).toContain("width: auto;");

    primary?.click();
    await flush();
    expect(onStartNew).toHaveBeenCalledTimes(1);
  });

  it("clears the list after the shell confirms delete-all", async () => {
    const { root, onRequestClearHistory } = mount();
    await flush();

    const clear = root.querySelector<HTMLButtonElement>(".persona-history-clear");
    expect(clear?.textContent).toBe("Delete all conversations");
    clear?.click();
    await flush();

    expect(onRequestClearHistory).toHaveBeenCalledTimes(1);
    expect(rows(root)).toHaveLength(0);
    expect(stateBlock(root)?.dataset.personaHistoryState).toBe("empty");
    expect(liveText(root)).toBe("All conversations were deleted.");
  });

  it("hides forget-this-device when the provider cannot reset", async () => {
    const { root } = mount();
    await flush();
    expect(root.querySelector(".persona-history-reset")).toBeNull();
  });

  it("shows forget-this-device when the provider can reset", async () => {
    const base = createDemoHistoryProvider({
      conversations: DEFAULT_SEEDS,
      now: () => NOW,
    });
    const provider: HistoryProvider = {
      ...base,
      resetDevice: async () => ({ remoteRevocationConfirmed: false }),
    };
    const { root, onRequestResetIdentity } = mount({ provider });
    await flush();

    const reset = root.querySelector<HTMLButtonElement>(".persona-history-reset");
    expect(reset?.textContent).toBe("Forget this device");
    reset?.click();
    await flush();
    expect(onRequestResetIdentity).toHaveBeenCalledTimes(1);
    expect(liveText(root)).toBe("This device was forgotten.");
  });

  it("separates destructive actions below the pagination region", async () => {
    const { root } = mount({ pageSize: 2 });
    await flush();
    const footer = root.querySelector(".persona-history-footer");
    const listRegion = root.querySelector(".persona-history-list-region");
    expect(
      listRegion?.compareDocumentPosition(footer as Node)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(footer?.querySelector(".persona-history-row")).toBeNull();
  });
});

describe("history view rail sections", () => {
  const svgIcon = (): SVGElement =>
    document.createElementNS("http://www.w3.org/2000/svg", "svg");

  const sections = (): HistoryViewOptions["railSections"] => [
    {
      id: "workspace",
      title: "Workspace",
      placement: "above-conversations",
      items: [
        { id: "projects", label: "Projects", iconNode: () => svgIcon(), onSelect: vi.fn() },
        { id: "drafts", label: "Drafts", badge: "3", onSelect: vi.fn() },
      ],
    },
    {
      id: "tools",
      placement: "below-conversations",
      items: [{ id: "export", label: "Export", onSelect: vi.fn() }],
    },
    {
      id: "account",
      placement: "footer",
      items: [{ id: "settings", label: "Settings", onSelect: vi.fn() }],
    },
  ];

  const sectionAt = (root: HTMLElement, id: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-persona-rail-section="${id}"]`);

  it("stacks the sections around the conversation list in placement order", async () => {
    const railSections = sections();
    const { root } = mount({ presentation: "rail", railSections });
    await flush();

    const body = root.querySelector<HTMLElement>(".persona-history-body")!;
    const order = Array.from(body.children).map(
      (child) =>
        child.getAttribute("data-persona-rail-section") ?? child.className
    );
    expect(order).toEqual([
      "persona-history-scope-alert",
      "persona-history-new",
      "workspace",
      "persona-history-scope",
      "persona-history-list-region",
      "tools",
      "account",
      "persona-history-footer",
    ]);
    // The footer bucket sinks to the bottom of the body above the destructive row.
    expect(sectionAt(root, "account")!.className).toContain(
      "persona-history-nav--footer"
    );
    // A titled section is a labelled group; the heading reuses the group treatment.
    const workspace = sectionAt(root, "workspace")!;
    const heading = workspace.querySelector(".persona-history-group-heading")!;
    expect(heading.textContent).toBe("Workspace");
    expect(workspace.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(sectionAt(root, "tools")!.getAttribute("aria-label")).toBe("tools");
  });

  it("builds each item from its icon thunk, label and badge", async () => {
    const railSections = sections();
    const { root } = mount({ presentation: "rail", railSections });
    await flush();

    const projects = root.querySelector<HTMLButtonElement>(
      '[data-persona-rail-item="projects"]'
    )!;
    expect(projects.type).toBe("button");
    expect(projects.getAttribute("aria-label")).toBe("Projects");
    expect(projects.querySelector(".persona-history-nav-icon svg")).not.toBeNull();
    expect(
      projects.querySelector(".persona-history-nav-label")?.textContent
    ).toBe("Projects");
    expect(projects.querySelector(".persona-history-nav-badge")).toBeNull();

    // No icon thunk: label only, and no collapsed-square opt-in.
    const drafts = root.querySelector<HTMLButtonElement>(
      '[data-persona-rail-item="drafts"]'
    )!;
    expect(drafts.querySelector(".persona-history-nav-icon")).toBeNull();
    expect(drafts.classList.contains("persona-history-nav-item--icon")).toBe(
      false
    );
    expect(drafts.querySelector(".persona-history-nav-badge")?.textContent).toBe(
      "3"
    );

    drafts.click();
    expect(railSections![0].items[1].onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders label-only when the icon thunk yields null", async () => {
    const { root } = mount({
      presentation: "rail",
      railSections: [
        {
          id: "workspace",
          placement: "above-conversations",
          items: [{ id: "projects", label: "Projects", iconNode: () => null, onSelect: vi.fn() }],
        },
      ],
    });
    await flush();
    const projects = root.querySelector<HTMLButtonElement>(
      '[data-persona-rail-item="projects"]'
    )!;
    expect(projects.querySelector(".persona-history-nav-icon")).toBeNull();
    expect(projects.textContent).toBe("Projects");
  });

  it("keeps the sections rail-only across a presentation flip", async () => {
    const railSections = sections();
    const { root, handle } = mount({ presentation: "panel", railSections });
    await flush();
    expect(root.querySelector("[data-persona-rail-section]")).toBeNull();

    handle.setPresentation("rail");
    await flush();
    expect(root.querySelectorAll("[data-persona-rail-section]")).toHaveLength(3);

    handle.setPresentation("panel");
    await flush();
    expect(root.querySelector("[data-persona-rail-section]")).toBeNull();

    // Back into rail re-attaches the same nodes rather than rebuilding them.
    handle.setPresentation("rail");
    await flush();
    expect(root.querySelectorAll("[data-persona-rail-section]")).toHaveLength(3);
  });

  it("keeps only the icon rows as squares in the collapsed rail", async () => {
    mount({ presentation: "rail", collapsed: true, railSections: sections() });
    await flush();
    const css = injectedHistoryCss();
    // Sections survive the body-child sweep that hides everything else.
    expect(css).toContain(
      ".persona-history-body > :not(.persona-history-new):not(.persona-history-nav)"
    );
    const hidden = css.slice(
      css.indexOf(
        ".persona-history-view--rail-collapsed .persona-history-nav .persona-history-group-heading"
      )
    );
    const hiddenBlock = hidden.slice(0, hidden.indexOf("}"));
    // Headings, labels, badges and every row without an icon go.
    expect(hiddenBlock).toContain(
      "button.persona-history-nav-item:not(.persona-history-nav-item--icon)"
    );
    expect(hiddenBlock).toContain(".persona-history-nav-label");
    expect(hiddenBlock).toContain(".persona-history-nav-badge");
    expect(hiddenBlock).toContain("display: none;");

    const square = css.slice(
      css.indexOf(
        ".persona-history-view--rail-collapsed button.persona-history-nav-item {"
      )
    );
    const squareBlock = square.slice(0, square.indexOf("}"));
    expect(squareBlock).toContain("width: 36px;");
    expect(squareBlock).toContain("margin: 0 auto;");
  });

  // Render-backed sections: the plugin seam the core normalizes into the same
  // array, carrying a `render` in place of items.
  it("mounts render-backed content under its heading and re-renders on collapse", async () => {
    const render = vi.fn((collapsed: boolean) => {
      const node = document.createElement("p");
      node.setAttribute("data-plugin", collapsed ? "collapsed" : "expanded");
      return node;
    });
    const { root, handle } = mount({
      presentation: "rail",
      railSections: [
        ...sections()!,
        {
          id: "pinned",
          title: "Pinned",
          placement: "above-conversations",
          items: [],
          render,
        },
      ],
    });
    await flush();

    const pinned = sectionAt(root, "pinned")!;
    // Config sections keep their array order ahead of it inside the bucket.
    expect(pinned.previousElementSibling).toBe(sectionAt(root, "workspace"));
    expect(pinned.querySelector(".persona-history-group-heading")?.textContent).toBe(
      "Pinned"
    );
    expect(pinned.querySelector("[data-plugin]")?.getAttribute("data-plugin")).toBe(
      "expanded"
    );
    expect(render).toHaveBeenCalledTimes(1);

    handle.setCollapsed(true);
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(true);
    // The previous content is replaced, not appended beside.
    expect(pinned.querySelectorAll("[data-plugin]")).toHaveLength(1);
    expect(pinned.querySelector("[data-plugin]")?.getAttribute("data-plugin")).toBe(
      "collapsed"
    );
    expect(pinned.querySelector(".persona-history-group-heading")).not.toBeNull();
  });

  it("hides the section when render yields null", async () => {
    const { root, handle } = mount({
      presentation: "rail",
      railSections: [
        {
          id: "pinned",
          title: "Pinned",
          placement: "above-conversations",
          items: [],
          render: (collapsed) => {
            if (collapsed) return null;
            return document.createElement("p");
          },
        },
      ],
    });
    await flush();
    const pinned = sectionAt(root, "pinned")!;
    expect(pinned.hidden).toBe(false);

    handle.setCollapsed(true);
    await flush();
    expect(pinned.hidden).toBe(true);
    expect(pinned.querySelector("p")).toBeNull();
    // Hiding beats the section's own display rule.
    expect(injectedHistoryCss()).toContain(
      ".persona-history-view .persona-history-nav[hidden]"
    );
  });

  it("warns once for a throwing render and empties only that section", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, handle } = mount({
      presentation: "rail",
      railSections: [
        {
          id: "pinned",
          placement: "above-conversations",
          items: [],
          render: () => {
            throw new Error("section exploded");
          },
        },
        {
          id: "tools",
          placement: "below-conversations",
          items: [],
          render: () => document.createElement("p"),
        },
      ],
    });
    await flush();
    const pinned = sectionAt(root, "pinned")!;
    expect(pinned.hidden).toBe(true);
    expect(pinned.childElementCount).toBe(0);
    expect(sectionAt(root, "tools")!.hidden).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[persona] history rail section threw",
      "pinned",
      expect.any(Error)
    );

    // A collapse re-renders the survivor and never re-enters the dropped one.
    handle.setCollapsed(true);
    await flush();
    expect(pinned.hidden).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("history view header placement", () => {
  const barOf = (root: HTMLElement): HTMLElement | null =>
    root.querySelector<HTMLElement>(".persona-history-topbar");

  it("carries the bar inline by default and holds nothing but the three controls", async () => {
    const { root } = mount();
    await flush();
    const bar = barOf(root)!;
    expect(bar.parentElement).toBe(root);
    expect(bar.querySelector(".persona-history-scope")).toBeNull();
    expect(bar.querySelector(".persona-history-scope-alert")).toBeNull();
    expect(bar.querySelectorAll("button")).toHaveLength(2);
  });

  it("leaves the bar out of the view element when the shell hosts it", async () => {
    const { root, handle } = mount({ headerPlacement: "external" });
    await flush();
    expect(barOf(root)).toBeNull();
    const bar = handle.getHeaderElement();
    expect(bar.classList.contains("persona-history-topbar")).toBe(true);
    expect(bar.isConnected).toBe(false);

    // The shell mounts it wherever it likes; the view never reclaims it.
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.appendChild(bar);
    handle.refresh();
    await flush();
    expect(bar.parentElement).toBe(host);
    host.remove();
  });

  it("moves the bar between the shell and the view without replaying the entrance", async () => {
    const { root, handle } = mount();
    await flush();
    const bar = handle.getHeaderElement();

    handle.setHeaderPlacement("external");
    expect(bar.parentElement).toBeNull();
    expect(bar.classList.contains("persona-history-topbar--shell")).toBe(true);
    // Idempotent: a repeat call must not disturb the shell's own hosting.
    const host = document.createElement("div");
    host.appendChild(bar);
    handle.setHeaderPlacement("external");
    expect(bar.parentElement).toBe(host);

    handle.setHeaderPlacement("inline");
    expect(bar.parentElement).toBe(root);
    expect(bar.nextElementSibling?.classList.contains("persona-history-body")).toBe(
      true
    );
    expect(bar.classList.contains("persona-history-topbar--shell")).toBe(false);
    expect(root.classList.contains("persona-history-view--enter")).toBe(true);
    handle.setHeaderPlacement("inline");
    expect(root.querySelectorAll(".persona-history-topbar")).toHaveLength(1);
  });

  it("keeps a header slot replacement in the shell host that already holds it", async () => {
    let custom: HTMLElement | null = null;
    const { handle, provider } = mount({
      headerPlacement: "external",
      slots: {
        header: ({ identityStatus, defaultRenderer }) => {
          if (identityStatus.state !== "verified") return defaultRenderer();
          custom = document.createElement("div");
          custom.setAttribute("data-test-header", "");
          return custom;
        },
      },
    });
    await flush();
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.appendChild(handle.getHeaderElement());

    provider.setIdentityStatus({ state: "verified" });
    await flush();
    expect(custom).not.toBeNull();
    expect(handle.getHeaderElement()).toBe(custom);
    expect(custom!.parentElement).toBe(host);
    host.remove();
  });

  it("removes the bar on destroy wherever it is hosted", async () => {
    const record = mount({ headerPlacement: "external" });
    await flush();
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.appendChild(record.handle.getHeaderElement());

    record.handle.destroy();
    mounted.splice(mounted.indexOf(record), 1);
    expect(host.childNodes).toHaveLength(0);
    host.remove();
  });
});

describe("history view unsupported affordances and lifecycle", () => {
  it("attaches the shell's tooltip to the bar controls and destroys it with the view", async () => {
    const destroy = vi.fn();
    const attachTooltip = vi.fn(
      (opts: { anchor: HTMLElement; text: string | (() => string) }) => {
        void opts;
        return {
          isOpen: false,
          show: () => {},
          hide: () => {},
          reposition: () => {},
          destroy,
        };
      }
    );
    const record = mount({ attachTooltip });
    await flush();
    expect(attachTooltip).toHaveBeenCalledTimes(2);
    const anchors = attachTooltip.mock.calls.map(([opts]) => opts.anchor);
    expect(anchors).toContain(record.root.querySelector(".persona-history-back"));
    expect(anchors).toContain(record.root.querySelector(".persona-history-new-icon"));
    // Live getter: a relabel (rail close) changes the tooltip text too.
    const backCall = attachTooltip.mock.calls.find(
      ([opts]) => opts.anchor === record.root.querySelector(".persona-history-back")
    )!;
    record.handle.setPresentation("rail");
    const text = backCall[0].text;
    expect(typeof text === "function" ? text() : text).toBe(
      "Collapse conversation list"
    );
    record.handle.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("renders no search, archive, unread, or delivery affordances", async () => {
    const { root } = mount();
    await flush();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector('[type="search"]')).toBeNull();
    expect(root.innerHTML).not.toMatch(/archive|unread|delivered/i);
  });

  it("is a labelled region with list semantics", async () => {
    const { root } = mount();
    await flush();
    expect(root.getAttribute("role")).toBe("region");
    const labelledBy = root.getAttribute("aria-labelledby");
    expect(root.querySelector(`#${labelledBy}`)?.textContent).toBe("Messages");
    expect(root.querySelectorAll("ul.persona-history-list").length).toBe(3);
    expect(root.querySelectorAll("li.persona-history-item").length).toBe(4);
  });

  it("drops subscriptions and DOM on destroy", async () => {
    const record = mount();
    await flush();
    const { provider, root } = record;

    record.handle.destroy();
    mounted.splice(mounted.indexOf(record), 1);

    expect(root.isConnected).toBe(false);
    expect(root.childNodes).toHaveLength(0);
    // A late provider notification must not resurrect any DOM.
    provider.setIdentityStatus({ state: "verified" });
    expect(root.childNodes).toHaveLength(0);
  });

  it("ignores a superseded list response", async () => {
    const { root, provider, handle } = mount();
    await flush();
    provider.setLatency(30);
    handle.refresh();
    provider.setLatency(0);
    handle.refresh();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(rows(root)).toHaveLength(4);
  });
});

/**
 * Entrance/exit motion. jsdom has no Web Animations API, so the fallback path
 * (no `element.animate`) is the default here and WAAPI is installed explicitly
 * for the animated path.
 */
describe("history view entrance and exit motion", () => {
  /** Structural stand-ins: the DOM keyframe types are not eslint globals. */
  type Frame = Record<string, string | number>;
  type FakeAnimation = {
    target: Element;
    keyframes: Frame[];
    options: { duration?: number };
    finished: Promise<Animation>;
    cancelled: boolean;
    cancel(): void;
    settle(): void;
  };

  const installWaapi = (): {
    animations: FakeAnimation[];
    restore: () => void;
  } => {
    const animations: FakeAnimation[] = [];
    const animate = function (
      this: Element,
      keyframes: Frame[],
      options: { duration?: number }
    ): Animation {
      let resolve!: () => void;
      let reject!: () => void;
      const finished = new Promise<Animation>((onDone, onFail) => {
        resolve = () => onDone(animation as unknown as Animation);
        reject = () => onFail(new Error("cancelled"));
      });
      const animation: FakeAnimation = {
        target: this,
        keyframes,
        options,
        finished,
        cancelled: false,
        cancel: () => {
          animation.cancelled = true;
          reject();
        },
        settle: resolve,
      };
      // Nothing observes an unsettled rejection until the view awaits it.
      finished.catch(() => undefined);
      animations.push(animation);
      return animation as unknown as Animation;
    } as unknown as Element["animate"];
    Element.prototype.animate = animate;
    return {
      animations,
      restore: () => {
        delete (Element.prototype as Partial<Element>).animate;
      },
    };
  };

  const injectedCss = (): string =>
    document.querySelector(
      'style[data-persona-plugin-style="persona-history-view"]'
    )?.textContent ?? "";

  const rootOf = (animations: FakeAnimation[]): FakeAnimation =>
    animations.find((animation) =>
      (animation.target as HTMLElement).classList.contains("persona-history-view")
    )!;
  const bodyOf = (animations: FakeAnimation[]): FakeAnimation =>
    animations.find((animation) =>
      (animation.target as HTMLElement).classList.contains("persona-history-body")
    )!;

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
  });

  it("enters by animating the body alone, never the root or the bar", async () => {
    const { root } = mount();
    await flush();
    expect(root.classList.contains("persona-history-view--enter")).toBe(true);

    const css = injectedCss();
    // The bar is persistent chrome: only the region below it moves.
    expect(css).not.toContain("@keyframes persona-history-enter {");
    expect(css).not.toContain(".persona-history-view--enter {");
    expect(css).toContain(".persona-history-view--enter .persona-history-body");
    expect(css).toContain("translateX(var(--persona-history-slide))");
    // Each presentation slides from its own edge; the rail travels less.
    expect(css).toContain("--persona-history-slide: 20px;");
    expect(css).toContain("--persona-history-slide: 12px;");
    expect(css).not.toContain(".persona-history-view--enter .persona-history-topbar");
  });

  it("fades the shell-hosted bar in once, without animating the bar chrome", async () => {
    const { handle } = mount({ headerPlacement: "external" });
    await flush();
    const bar = handle.getHeaderElement();
    expect(bar.classList.contains("persona-history-topbar--shell")).toBe(true);

    const css = injectedCss();
    expect(css).toContain(
      ".persona-history-topbar--shell.persona-history-topbar--shell-enter"
    );
    const fade = css.slice(css.indexOf("@keyframes persona-history-header-fade"));
    expect(fade.slice(0, fade.indexOf("}"))).not.toContain("transform");
  });

  it("drops the entrance before a host move so re-parenting cannot replay it", async () => {
    const { root, handle } = mount();
    await flush();
    expect(root.classList.contains("persona-history-view--enter")).toBe(true);

    handle.setPresentation("rail");
    expect(root.classList.contains("persona-history-view--enter")).toBe(false);
    expect(root.classList.contains("persona-history-view--rail")).toBe(true);

    // Re-inserting the element (what the shell does to move hosts) adds nothing.
    root.remove();
    document.body.appendChild(root);
    expect(root.classList.contains("persona-history-view--enter")).toBe(false);
  });

  it("reports nothing to await when the platform has no animation support", async () => {
    const { root, handle } = mount();
    await flush();
    expect(handle.playExit()).toBeNull();
    expect(root.classList.contains("persona-history-view--enter")).toBe(false);
  });

  it("mirrors the entrance on exit and resolves when the animation finishes", async () => {
    const waapi = installWaapi();
    try {
      const { root, handle } = mount();
      await flush();

      let resolved = false;
      const exit = handle.playExit()!;
      void exit.then(() => {
        resolved = true;
      });
      expect(exit).not.toBeNull();
      expect(root.classList.contains("persona-history-view--enter")).toBe(false);
      expect(root.style.pointerEvents).toBe("none");

      // Body only: the bar is furniture and switches back instantly.
      expect(rootOf(waapi.animations)).toBeUndefined();
      const bodyAnimation = bodyOf(waapi.animations);
      expect(bodyAnimation.keyframes.map((frame) => frame.opacity)).toEqual(["1", 0]);
      expect(bodyAnimation.keyframes.map((frame) => frame.transform)).toEqual([
        "none",
        "translateX(20px)",
      ]);
      expect(bodyAnimation.options.duration).toBe(160);

      await flush();
      expect(resolved).toBe(false);
      waapi.animations.forEach((animation) => animation.settle());
      await exit;
      expect(resolved).toBe(true);
    } finally {
      waapi.restore();
    }
  });

  it("slides a shorter distance from the rail's own trailing edge", async () => {
    const waapi = installWaapi();
    try {
      const { handle } = mount({ presentation: "rail" });
      await flush();
      handle.playExit();
      expect(bodyOf(waapi.animations).keyframes[1]!.transform).toBe("translateX(12px)");
    } finally {
      waapi.restore();
    }
  });

  it("joins the running exit instead of restarting it", async () => {
    const waapi = installWaapi();
    try {
      const { handle } = mount();
      await flush();
      const first = handle.playExit();
      const second = handle.playExit();
      expect(second).toBe(first);
      expect(waapi.animations).toHaveLength(1);
    } finally {
      waapi.restore();
    }
  });

  it("resolves a cancelled exit rather than leaving the caller waiting", async () => {
    const waapi = installWaapi();
    try {
      const { handle } = mount();
      await flush();
      const exit = handle.playExit()!;
      waapi.animations.forEach((animation) => animation.cancel());
      await expect(exit).resolves.toBeUndefined();
    } finally {
      waapi.restore();
    }
  });

  it("skips both entrance and exit under prefers-reduced-motion", async () => {
    const waapi = installWaapi();
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const { root, handle } = mount();
      await flush();
      expect(handle.playExit()).toBeNull();
      expect(waapi.animations).toHaveLength(0);
      expect(root.classList.contains("persona-history-view--enter")).toBe(false);
      // The skeleton's own reduced-motion handling stays in CSS, untouched.
      expect(injectedCss()).toContain(
        ".persona-history-view .persona-history-skeleton-bar { animation: none; }"
      );
    } finally {
      window.matchMedia = previousMatchMedia;
      waapi.restore();
    }
  });

  it("cancels a running exit on destroy", async () => {
    const waapi = installWaapi();
    try {
      const record = mount();
      await flush();
      record.handle.playExit();
      record.handle.destroy();
      mounted.splice(mounted.indexOf(record), 1);
      expect(waapi.animations.every((animation) => animation.cancelled)).toBe(true);
    } finally {
      waapi.restore();
    }
  });
});
