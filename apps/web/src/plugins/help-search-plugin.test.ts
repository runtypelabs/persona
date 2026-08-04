// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentWidgetPluginStorage,
  AgentWidgetRenderWelcomeContext,
} from "@runtypelabs/persona";

import {
  createHelpSearchPlugin,
  createStaticArticleSearch,
  type HelpSearchArticle,
  type HelpSearchPluginOptions,
} from "./help-search-plugin";

const ARTICLES: HelpSearchArticle[] = [
  {
    id: "refunds",
    title: "Request a refund",
    url: "https://example.com/help/refunds",
    summary: "Refunds land within five business days.",
    section: "Billing",
  },
  {
    id: "invoices",
    title: "Download an invoice",
    url: "https://example.com/help/invoices",
    section: "Billing",
  },
];

const memoryStorage = (): AgentWidgetPluginStorage => {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
  };
};

/** Mirrors the core's welcome arbitration: permanent host, cleanups, fresh ctx. */
const createWelcomeHarness = (
  plugin: ReturnType<typeof createHelpSearchPlugin>,
) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const cleanups: Array<() => void> = [];
  const sent: string[] = [];

  const render = (): HTMLElement | null => {
    cleanups.splice(0, cleanups.length).forEach((fn) => fn());
    return (
      plugin.renderWelcome?.({
        config: {
          title: "Hello",
          subtitle: "Ask about anything on this page.",
          variant: "card",
          dismiss: "never",
        },
        variant: "card",
        visible: true,
        defaultRenderer: () => host,
        sendMessage: (text) => {
          sent.push(text);
        },
        requestRender: () => {
          render();
        },
        renderStarter: () => document.createElement("button"),
        storage: memoryStorage(),
        onCleanup: (fn) => {
          cleanups.push(fn);
        },
      } satisfies AgentWidgetRenderWelcomeContext) ?? null
    );
  };

  return {
    host,
    render,
    sent,
    input: () => host.querySelector<HTMLInputElement>(".help-search__input"),
    status: () => host.querySelector<HTMLElement>(".help-search__status"),
    results: () =>
      Array.from(host.querySelectorAll<HTMLElement>(".help-search__result")),
    card: () => host.querySelector<HTMLElement>(".help-search"),
  };
};

const type = (field: HTMLInputElement, value: string): void => {
  field.value = value;
  field.dispatchEvent(new Event("input"));
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("createHelpSearchPlugin", () => {
  it("composes with the default welcome instead of replacing it", () => {
    const plugin = createHelpSearchPlugin({
      search: createStaticArticleSearch(ARTICLES, 0),
    });
    const harness = createWelcomeHarness(plugin);
    const marker = document.createElement("p");
    harness.host.appendChild(marker);

    const returned = harness.render();

    expect(returned).toBe(harness.host);
    expect(marker.isConnected).toBe(true);
    expect(harness.card()).not.toBeNull();
  });

  it("debounces keystrokes into a single search call", async () => {
    const search = vi.fn<HelpSearchPluginOptions["search"]>(async () => ARTICLES);
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({ search, debounceMs: 200 }),
    );
    harness.render();
    const field = harness.input()!;

    type(field, "re");
    type(field, "ref");
    type(field, "refu");
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("refu");
  });

  it("aborts the in-flight request and ignores its stale response", async () => {
    const seen: AbortSignal[] = [];
    const search = vi.fn<HelpSearchPluginOptions["search"]>(
      (query, signal) =>
        new Promise((resolve) => {
          seen.push(signal);
          setTimeout(
            () => resolve(query === "refund" ? ARTICLES : [ARTICLES[1]]),
            query === "refund" ? 500 : 10,
          );
        }),
    );
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({ search, debounceMs: 50 }),
    );
    harness.render();
    const field = harness.input()!;

    type(field, "refund");
    await vi.advanceTimersByTimeAsync(50);
    type(field, "invoice");
    await vi.advanceTimersByTimeAsync(50);

    expect(seen[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(600);

    // The slow first query resolved last and must not win.
    expect(harness.results()).toHaveLength(1);
    expect(harness.results()[0].textContent).toContain("Download an invoice");
  });

  it("resets to idle under the minimum query length without searching", async () => {
    const search = vi.fn<HelpSearchPluginOptions["search"]>(async () => ARTICLES);
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({ search, debounceMs: 10, minQueryLength: 3 }),
    );
    harness.render();
    const field = harness.input()!;

    type(field, "re");
    await vi.advanceTimersByTimeAsync(50);

    expect(search).not.toHaveBeenCalled();
    expect(harness.status()?.hidden).toBe(true);
  });

  it("reports an empty result set", async () => {
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({
        search: createStaticArticleSearch(ARTICLES, 0),
        debounceMs: 10,
      }),
    );
    harness.render();

    type(harness.input()!, "shipping");
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.status()?.textContent).toContain("No articles match");
  });

  it("reports a failing search without throwing", async () => {
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({
        search: async () => {
          throw new Error("network down");
        },
        debounceMs: 10,
      }),
    );
    harness.render();

    type(harness.input()!, "refund");
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.status()?.textContent).toContain("unavailable");
  });

  it("renders open results as new-tab anchors", async () => {
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({
        search: createStaticArticleSearch(ARTICLES, 0),
        debounceMs: 10,
        resultAction: "open",
      }),
    );
    harness.render();

    type(harness.input()!, "billing");
    await vi.advanceTimersByTimeAsync(50);

    const [first] = harness.results();
    expect(first.tagName).toBe("A");
    expect(first.getAttribute("target")).toBe("_blank");
    expect(first.getAttribute("rel")).toBe("noopener noreferrer");
    expect((first as HTMLAnchorElement).href).toBe(ARTICLES[0].url);
  });

  it("sends a templated prompt for ask results and clears the query", async () => {
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({
        search: createStaticArticleSearch(ARTICLES, 0),
        debounceMs: 10,
        resultAction: "ask",
        askPrompt: (article) => `Explain ${article.title} (${article.url})`,
      }),
    );
    harness.render();

    type(harness.input()!, "refund");
    await vi.advanceTimersByTimeAsync(50);
    const [first] = harness.results();
    expect(first.tagName).toBe("BUTTON");
    first.click();

    expect(harness.sent).toEqual([
      "Explain Request a refund (https://example.com/help/refunds)",
    ]);
    expect(harness.input()?.value).toBe("");
    expect(harness.results()).toHaveLength(0);
  });

  it("clears the query on escape", async () => {
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({
        search: createStaticArticleSearch(ARTICLES, 0),
        debounceMs: 10,
      }),
    );
    harness.render();
    const field = harness.input()!;

    type(field, "refund");
    await vi.advanceTimersByTimeAsync(50);
    expect(harness.results()).toHaveLength(1);

    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await vi.advanceTimersByTimeAsync(50);

    expect(field.value).toBe("");
    expect(harness.results()).toHaveLength(0);
  });

  it("re-arbitration drops the old card, keeps the query, and cancels pending work", async () => {
    const search = vi.fn<HelpSearchPluginOptions["search"]>(async () => ARTICLES);
    const harness = createWelcomeHarness(
      createHelpSearchPlugin({ search, debounceMs: 200 }),
    );
    harness.render();
    type(harness.input()!, "refund");

    harness.render();

    expect(harness.host.querySelectorAll(".help-search")).toHaveLength(1);
    expect(harness.input()?.value).toBe("refund");
    await vi.advanceTimersByTimeAsync(500);
    expect(search).not.toHaveBeenCalled();
  });

  it("focusSearch focuses the live input", () => {
    const plugin = createHelpSearchPlugin({
      search: createStaticArticleSearch(ARTICLES, 0),
    });
    const harness = createWelcomeHarness(plugin);
    harness.render();

    plugin.focusSearch();

    expect(document.activeElement).toBe(harness.input());
  });

  it("promotes results to starters and restores them when the query clears", async () => {
    const plugin = createHelpSearchPlugin({
      search: createStaticArticleSearch(ARTICLES, 0),
      debounceMs: 10,
      promoteResultsToStarters: true,
    });
    const update = vi.fn();
    plugin.attach({ update } as never);
    const harness = createWelcomeHarness(plugin);
    harness.render();

    const starters = [
      {
        id: "configured",
        label: "Track my order",
        prompt: "Track my order",
        behavior: "send" as const,
        emphasis: "default" as const,
      },
    ];
    const transform = () =>
      plugin.transformSuggestions?.({
        suggestions: starters,
        surface: "starter",
        source: "config",
        config: {},
      });

    expect(transform()).toEqual(starters);

    type(harness.input()!, "billing");
    await vi.advanceTimersByTimeAsync(50);

    const promoted = transform();
    expect(promoted?.map((item) => (typeof item === "string" ? item : item.id)))
      .toEqual(["help-refunds", "help-invoices"]);
    expect(update).toHaveBeenCalledWith({});

    type(harness.input()!, "");
    await vi.advanceTimersByTimeAsync(50);

    expect(transform()).toEqual(starters);
  });

  it("leaves follow-up suggestions alone while promoting", async () => {
    const plugin = createHelpSearchPlugin({
      search: createStaticArticleSearch(ARTICLES, 0),
      debounceMs: 10,
      promoteResultsToStarters: true,
    });
    const harness = createWelcomeHarness(plugin);
    harness.render();

    type(harness.input()!, "billing");
    await vi.advanceTimersByTimeAsync(50);

    const followUps = [
      {
        id: "next",
        label: "Anything else?",
        prompt: "Anything else?",
        behavior: "send" as const,
        emphasis: "default" as const,
      },
    ];
    expect(
      plugin.transformSuggestions?.({
        suggestions: followUps,
        surface: "followUp",
        source: "agent",
        config: {},
      }),
    ).toEqual(followUps);
  });
});
