// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "../ui";
import { createLocalStorageAdapter } from "../utils/storage";
import type { AgentWidgetStorageAdapter } from "../types";

const DEFAULT_KEY = "persona-state";

const baseConfig = () => ({
  apiUrl: "https://api.example.com/chat",
  launcher: { enabled: false } as const,
});

const inject = (controller: ReturnType<typeof createAgentExperience>) =>
  controller.injectAssistantMessage({ content: "hello world" });

describe("persistState gates storage adapter", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  it("persistState: false skips the default localStorage adapter", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      persistState: false,
    });

    inject(controller);

    expect(window.localStorage.getItem(DEFAULT_KEY)).toBeNull();
    controller.destroy();
  });

  it("persistState: false ignores any user-supplied storageAdapter (strict semantic)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const customAdapter: AgentWidgetStorageAdapter = {
      load: vi.fn(() => null),
      save: vi.fn(),
      clear: vi.fn(),
    };

    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      persistState: false,
      storageAdapter: customAdapter,
    });

    inject(controller);

    expect(customAdapter.load).not.toHaveBeenCalled();
    expect(customAdapter.save).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("default config (persistState undefined) writes to the default localStorage key", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, baseConfig());

    inject(controller);

    const stored = window.localStorage.getItem(DEFAULT_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.messages).toBeInstanceOf(Array);
    expect(parsed.messages.length).toBeGreaterThan(0);
    controller.destroy();
  });

  it("persistState: true keeps using the default localStorage adapter", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      persistState: true,
    });

    inject(controller);

    expect(window.localStorage.getItem(DEFAULT_KEY)).not.toBeNull();
    controller.destroy();
  });

  it("two widgets with different storageAdapter keys keep their messages isolated", () => {
    const mountA = document.createElement("div");
    const mountB = document.createElement("div");
    document.body.appendChild(mountA);
    document.body.appendChild(mountB);

    const controllerA = createAgentExperience(mountA, {
      ...baseConfig(),
      storageAdapter: createLocalStorageAdapter("persona-state-test-a"),
    });
    const controllerB = createAgentExperience(mountB, {
      ...baseConfig(),
      storageAdapter: createLocalStorageAdapter("persona-state-test-b"),
    });

    controllerA.injectAssistantMessage({ content: "message in A" });
    controllerB.injectAssistantMessage({ content: "message in B" });

    const storedA = JSON.parse(window.localStorage.getItem("persona-state-test-a")!);
    const storedB = JSON.parse(window.localStorage.getItem("persona-state-test-b")!);

    const aHasA = storedA.messages.some((m: { content?: string }) => m.content === "message in A");
    const aHasB = storedA.messages.some((m: { content?: string }) => m.content === "message in B");
    const bHasA = storedB.messages.some((m: { content?: string }) => m.content === "message in A");
    const bHasB = storedB.messages.some((m: { content?: string }) => m.content === "message in B");

    expect(aHasA).toBe(true);
    expect(aHasB).toBe(false);
    expect(bHasB).toBe(true);
    expect(bHasA).toBe(false);
    expect(window.localStorage.getItem(DEFAULT_KEY)).toBeNull();

    controllerA.destroy();
    controllerB.destroy();
  });

  it("persistState: false does not read from localStorage on init", () => {
    // Pre-seed the default key with a stored message.
    window.localStorage.setItem(
      DEFAULT_KEY,
      JSON.stringify({ messages: [{ id: "stale", role: "assistant", content: "stale" }] })
    );

    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      persistState: false,
    });

    expect(controller.getMessages()).toEqual([]);
    controller.destroy();
  });
});
