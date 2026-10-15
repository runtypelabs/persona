// @vitest-environment jsdom

/**
 * Version skew on the CDN: a fresh `index.global.js` paired with a cached
 * `history-view.js` that predates the `showHistoryConfirm` export. Own file
 * because `loadHistoryView` memoizes the resolved module per module graph.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import type { HistoryViewOptions } from "./history-view-entry";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
} from "./internal/demo-history-provider";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [{ id: "a1", role: "user", content: "where is my order" }],
  },
];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

type HistoryViewModule = Awaited<
  ReturnType<Parameters<typeof setHistoryViewLoader>[0]>
>;

describe("history confirm with a stale chunk", () => {
  let controller: ReturnType<typeof createAgentExperience> | null = null;
  let mount: HTMLElement | null = null;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryProviderFactory(() =>
      createDemoHistoryProvider({ conversations: SEEDS })
    );
  });

  afterEach(() => {
    setHistoryProviderFactory(null);
    controller?.destroy();
    controller = null;
    mount?.remove();
    mount = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // Runs first: a resolved chunk is memoized for the rest of the module graph,
  // so the rejecting loader only takes effect before any successful load.
  it("falls back to the native confirm when the chunk fails to load", async () => {
    setHistoryViewLoader(async () => {
      throw new Error("chunk fetch failed");
    });
    mount = document.createElement("div");
    document.body.appendChild(mount);
    controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      persistState: false,
      features: { history: { enabled: true } },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    await controller.openConversation("conv-a");
    await flush();

    // The title-menu delete needs no history view: it goes straight to the
    // confirm, whose chunk load rejects.
    const deleteFromTitleMenu = () =>
      mount!
        .querySelector('[data-persona-theme-zone="header"]')!
        .dispatchEvent(
          new CustomEvent("persona:title-menu-builtin", {
            bubbles: true,
            detail: { actionId: "delete" },
          })
        );
    const listIds = async () =>
      (await controller!.listConversations({ limit: 10 })).items.map(
        (item) => item.id
      );

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    deleteFromTitleMenu();
    await flush();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(await listIds()).toContain("conv-a");

    confirmSpy.mockReturnValue(true);
    deleteFromTitleMenu();
    await flush();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(await listIds()).not.toContain("conv-a");
  });

  it("falls back to the native confirm when the chunk lacks showHistoryConfirm", async () => {
    let viewOptions: HistoryViewOptions | null = null;
    // Older chunk shape: no showHistoryConfirm export.
    setHistoryViewLoader(
      async () =>
        ({
          createHistoryView: (options: HistoryViewOptions) => {
            viewOptions = options;
            return createHistoryView(options);
          },
        }) as unknown as HistoryViewModule
    );
    mount = document.createElement("div");
    document.body.appendChild(mount);
    controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      persistState: false,
      features: { history: { enabled: true } },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]")!.click();
    await flush();
    expect(viewOptions).not.toBeNull();
    const requestClear = viewOptions!.onRequestClearHistory!;

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await expect(requestClear()).resolves.toBe("cancelled");
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValue(true);
    await expect(requestClear()).resolves.toBe("cleared");
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });
});
