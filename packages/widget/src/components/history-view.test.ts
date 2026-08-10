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

const liveText = (root: HTMLElement): string =>
  root.querySelector("[data-persona-history-live-region]")?.textContent ?? "";

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.handle.destroy();
  document.body.replaceChildren();
});

describe("history view rows", () => {
  it("renders rows in server order with the beta hierarchy", async () => {
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
    expect(preview?.classList.contains("persona-history-clamp")).toBe(true);
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
  it("collapses the browser-only scope to one subtitle with an sr-only description", async () => {
    const { root } = mount();
    await flush();

    expect(root.querySelector(".persona-history-scope-title")?.textContent).toBe(
      "Messages on this device"
    );
    const block = root.querySelector<HTMLElement>(".persona-history-scope-alert");
    expect(block?.dataset.personaHistoryIdentity).toBe("browser_only");
    expect(block?.textContent).toContain("separate history");
    expect(block?.hasAttribute("role")).toBe(false);
    // No second visual band: the sentence is reachable only through the subtitle.
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

    const newIcon = root.querySelector<HTMLButtonElement>(
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
    const { root } = mount({ presentation: "rail" });
    await flush();
    expect(root.classList.contains("persona-history-view--rail")).toBe(true);
    expect(root.dataset.personaHistoryPresentation).toBe("rail");
    expect(
      root
        .querySelector('[data-persona-history-focus="close"]')
        ?.getAttribute("aria-label")
    ).toBe("Close conversation list");
  });

  it("runs the primary new-conversation action from the list region", async () => {
    const { root, onStartNew } = mount();
    await flush();
    const primary = root.querySelector<HTMLButtonElement>(".persona-history-new");
    expect(primary?.textContent).toContain("New conversation");
    // The primary action sits above the list region.
    expect(
      primary?.compareDocumentPosition(
        root.querySelector(".persona-history-list-region") as Node
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

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

describe("history view unsupported affordances and lifecycle", () => {
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

  it("enters with a class that fades the root and slides only the body", async () => {
    const { root } = mount();
    await flush();
    expect(root.classList.contains("persona-history-view--enter")).toBe(true);

    const css = injectedCss();
    const enterFrames = css.slice(
      css.indexOf("@keyframes persona-history-enter {"),
      css.indexOf("@keyframes persona-history-enter-body {")
    );
    // The top bar must read as persistent chrome: nothing above the body moves.
    expect(enterFrames).not.toContain("transform");
    expect(css).toContain(".persona-history-view--enter .persona-history-body");
    expect(css).toContain("translateX(var(--persona-history-slide))");
    // Each presentation slides from its own edge; the rail travels less.
    expect(css).toContain("--persona-history-slide: 20px;");
    expect(css).toContain("--persona-history-slide: 12px;");
    expect(css).not.toContain(".persona-history-view--enter .persona-history-topbar");
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

      const rootAnimation = rootOf(waapi.animations);
      const bodyAnimation = bodyOf(waapi.animations);
      expect(rootAnimation.keyframes.map((frame) => frame.opacity)).toEqual(["1", 0]);
      expect(rootAnimation.keyframes.some((frame) => "transform" in frame)).toBe(false);
      expect(bodyAnimation.keyframes.map((frame) => frame.transform)).toEqual([
        "none",
        "translateX(20px)",
      ]);
      expect(rootAnimation.options.duration).toBe(160);

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
      expect(waapi.animations).toHaveLength(2);
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
