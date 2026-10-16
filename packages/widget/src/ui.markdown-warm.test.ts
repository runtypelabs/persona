// @vitest-environment jsdom

/** Render preparation fetches markdown before reveal, including empty closed
 * widgets created directly. The installer still defers the entire widget until
 * launcher interaction. An unresolved parser must keep content hidden. */
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

describe("markdown-parsers preparation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.mocked(loadMarkdownParsers).mockClear();
  });

  it("prepares a fresh closed widget before its first reveal", () => {
    const controller = createAgentExperience(createMount(), {
      apiUrl: "https://api.example.com/chat",
      persistState: false,
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    expect(loadMarkdownParsers).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-persona-preparing]")).not.toBeNull();
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
    expect(document.querySelector("[data-persona-preparing]")).not.toBeNull();
    controller.destroy();
  });

  it("prepares before an async storage adapter resolves with messages", async () => {
    const controller = createAgentExperience(createMount(), {
      apiUrl: "https://api.example.com/chat",
      persistState: true,
      storageAdapter: {
        load: () => Promise.resolve({ messages: restoredMessages, metadata: {} }),
        save: () => {},
        clear: () => {},
      },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    expect(loadMarkdownParsers).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadMarkdownParsers).toHaveBeenCalled();
    expect(document.querySelector("[data-persona-preparing]")).not.toBeNull();
    controller.destroy();
  });
});
