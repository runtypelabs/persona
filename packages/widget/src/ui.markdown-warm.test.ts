// @vitest-environment jsdom

/**
 * Warm-trigger test for the lazy markdown-parsers chunk: the fetch must kick
 * when a session starts with restored/seeded messages (which would otherwise
 * paint escaped while closed and flash at first open) and must NOT kick for a
 * fresh widget with no messages, so visitors who never engage never pay the
 * ~21 kB fetch.
 *
 * The vitest setup file eagerly provides the parsers (mirroring the npm
 * build), which would satisfy every load before the trigger is observable —
 * so the loader module is mocked here to behave like the CDN build before the
 * chunk lands: nothing loaded, loads never resolve.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { loadMarkdownParsers } from "./markdown-parsers-loader";

vi.mock("./markdown-parsers-loader", () => ({
  loadMarkdownParsers: vi.fn(() => new Promise(() => {})),
  getMarkdownParsersSync: vi.fn(() => null),
  onMarkdownParsersReady: vi.fn(() => () => {}),
  provideMarkdownParsers: vi.fn(),
  setMarkdownParsersLoader: vi.fn(),
}));

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const restoredMessages = [
  {
    id: "m1",
    role: "assistant" as const,
    content: "**Restored** markdown.",
    createdAt: "2026-08-23T00:00:00.000Z",
    streaming: false,
  },
];

describe("markdown-parsers warm trigger", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.mocked(loadMarkdownParsers).mockClear();
  });

  it("does not fetch for a fresh closed widget with no messages", () => {
    const controller = createAgentExperience(createMount(), {
      apiUrl: "https://api.example.com/chat",
      persistState: false,
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    expect(loadMarkdownParsers).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("fetches at init when a sync storage adapter restores messages", () => {
    const controller = createAgentExperience(createMount(), {
      apiUrl: "https://api.example.com/chat",
      persistState: true,
      storageAdapter: {
        load: () => ({ messages: restoredMessages, metadata: {} }),
        save: () => {},
        clear: () => {},
      },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    // Warmed before any open: the panel is still closed.
    expect(loadMarkdownParsers).toHaveBeenCalled();
    controller.destroy();
  });

  it("fetches when an async storage adapter resolves with messages", async () => {
    const controller = createAgentExperience(createMount(), {
      apiUrl: "https://api.example.com/chat",
      persistState: true,
      storageAdapter: {
        load: () => Promise.resolve({ messages: restoredMessages, metadata: {} }),
        save: () => {},
        clear: () => {},
      },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    expect(loadMarkdownParsers).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadMarkdownParsers).toHaveBeenCalled();
    controller.destroy();
  });
});
