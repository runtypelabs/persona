// @vitest-environment jsdom

/**
 * Lazy-chunk transport for the Messages surface. Lives in its own file because
 * `loadHistoryView` memoizes the resolved module for the lifetime of the module
 * graph: a successful load anywhere in a file would mask the failure path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

describe("history lazy chunk", () => {
  let controller: ReturnType<typeof createAgentExperience> | null = null;
  let mount: HTMLElement | null = null;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryProviderFactory(() => createDemoHistoryProvider());
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

  it("keeps the conversation interactive on a rejected load and retries later", async () => {
    setHistoryViewLoader(async () => {
      throw new Error("chunk rejected");
    });
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

    expect(mount.querySelector(".persona-history-view")).toBeNull();
    expect(controller.isHistoryVisible()).toBe(false);
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    expect(body.style.display).not.toBe("none");
    expect(body.hasAttribute("inert")).toBe(false);

    // A dropped fetch must not disable the feature for the session.
    setHistoryViewLoader(async () => ({ createHistoryView }));
    mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]")!.click();
    await flush();
    expect(mount.querySelector(".persona-history-view")).not.toBeNull();
    expect(controller.isHistoryVisible()).toBe(true);
  });
});
