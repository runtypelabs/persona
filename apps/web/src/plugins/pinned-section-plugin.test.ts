// @vitest-environment jsdom

/**
 * The demo `railSections` blueprint. Pins the two claims the state-lab page
 * makes about it: the section mounts above the conversation list in the rail
 * beside Persona's own view, and it renders nothing while the rail is
 * collapsed.
 */

import { describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "@runtypelabs/persona";
import { setHistoryProviderFactory } from "@runtypelabs/persona/internal/history-provider-registry";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";

import { createPinnedSectionPlugin } from "./pinned-section-plugin";

const flush = async (times = 30) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

describe("pinned rail section demo plugin", () => {
  it("mounts above the conversation list and steps aside when collapsed", async () => {
    window.scrollTo = vi.fn();
    const picked: string[] = [];
    setHistoryProviderFactory(() =>
      createDemoHistoryProvider({
        conversations: [
          {
            id: "c1",
            title: "Order status",
            targetId: null,
            messages: [{ id: "m1", role: "user", content: "where is my order" }],
          },
        ],
      }),
    );

    const host = document.createElement("div");
    document.body.appendChild(host);
    const controller = createAgentExperience(host, {
      apiUrl: "https://example.com/chat",
      launcher: { enabled: false },
      persistState: false,
      suggestionChips: [],
      features: { history: { enabled: true, presentation: "rail" } },
      plugins: [createPinnedSectionPlugin((label) => picked.push(label))],
    } as never);

    const container = host.querySelector<HTMLElement>(".persona-widget-container")!;
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      get: () => 900,
    });

    await controller.showHistory();
    await flush();

    const section = host.querySelector<HTMLElement>(
      '[data-persona-rail-section="pinned"]',
    )!;
    expect(section).not.toBeNull();
    // Persona's own view still owns the list beneath it.
    expect(host.querySelector(".persona-history-view")).not.toBeNull();
    expect(
      section.compareDocumentPosition(
        host.querySelector(".persona-history-list-region")!,
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const rows = section.querySelectorAll<HTMLButtonElement>(".persona-pins__row");
    expect(rows.length).toBe(2);
    rows[0]!.click();
    expect(picked).toEqual(["Getting started"]);

    host
      .querySelector<HTMLButtonElement>('[data-persona-history-focus="collapse"]')!
      .click();
    await flush();
    expect(section.hidden).toBe(true);
    expect(section.querySelector(".persona-pins__row")).toBeNull();

    setHistoryProviderFactory(null);
    controller.destroy();
    host.remove();
  });
});
