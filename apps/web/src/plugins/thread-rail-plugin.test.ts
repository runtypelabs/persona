// @vitest-environment jsdom

/**
 * The demo `renderHistoryView` blueprint. Pins the two claims the state-lab
 * page makes about it: the plugin's DOM replaces Persona's Messages view
 * outright, and selection still routes through the shell's action path.
 */

import { describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "@runtypelabs/persona";
import { setHistoryProviderFactory } from "@runtypelabs/persona/internal/history-provider-registry";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";

import { createThreadRailPlugin } from "./thread-rail-plugin";

const flush = async (times = 30) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

describe("thread rail demo plugin", () => {
  it("replaces the default Messages view and drives selection", async () => {
    window.scrollTo = vi.fn();
    const provider = createDemoHistoryProvider({
      conversations: [
        {
          id: "c1",
          title: "Order status",
          targetId: null,
          messages: [{ id: "m1", role: "user", content: "where is my order" }],
        },
        {
          id: "c2",
          title: "Refund request",
          targetId: null,
          messages: [{ id: "m2", role: "user", content: "i need a refund" }],
        },
      ],
    });
    setHistoryProviderFactory(() => provider);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const controller = createAgentExperience(host, {
      apiUrl: "https://example.com/chat",
      launcher: { enabled: false },
      persistState: false,
      suggestionChips: [],
      features: { history: { enabled: true } },
      plugins: [createThreadRailPlugin()],
    } as never);

    await controller.showHistory();
    await flush();

    expect(host.querySelector(".persona-history-view")).toBeNull();
    expect(host.querySelector(".persona-threads")).not.toBeNull();
    const rows = host.querySelectorAll<HTMLButtonElement>(".persona-threads__row");
    expect(rows.length).toBe(2);

    // Newest first, so the first row is the most recently updated record.
    rows[0]!.click();
    await flush(40);
    expect(provider.getActiveConversationId()).toBe("c2");

    setHistoryProviderFactory(null);
    controller.destroy();
    host.remove();
  });
});
