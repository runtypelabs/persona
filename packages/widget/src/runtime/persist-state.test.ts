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

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async (times = 4) => {
  for (let index = 0; index < times; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

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

  it("serializes async saves and preserves the newest transcript", async () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const firstSave = deferred();
    const payloads: Array<{ messages?: Array<{ content?: string }> }> = [];
    const save = vi.fn((state: { messages?: Array<{ content?: string }> }) => {
      payloads.push(state);
      return save.mock.calls.length === 1 ? firstSave.promise : Promise.resolve();
    });
    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      storageAdapter: { save },
    });

    controller.injectAssistantMessage({ content: "first" });
    controller.injectAssistantMessage({ content: "second" });

    expect(save).toHaveBeenCalledTimes(1);
    firstSave.resolve();
    await flushMicrotasks();

    expect(save).toHaveBeenCalledTimes(2);
    expect(payloads[1].messages?.map((message) => message.content)).toEqual([
      "first",
      "second",
    ]);
    controller.destroy();
  });

  it("orders clear after pending saves so stale state cannot be resurrected", async () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const firstSave = deferred();
    const operations: string[] = [];
    const save = vi.fn(() => {
      operations.push("save");
      return save.mock.calls.length === 1 ? firstSave.promise : Promise.resolve();
    });
    const clear = vi.fn(() => {
      operations.push("clear");
      return Promise.resolve();
    });
    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      storageAdapter: { save, clear },
    });

    inject(controller);
    controller.clearChat();

    expect(operations).toEqual(["save"]);
    firstSave.resolve();
    await flushMicrotasks(20);

    expect(operations).toEqual(["save", "save", "clear"]);
    expect(clear).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("continues queued storage mutations after an async save rejects", async () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const firstSave = deferred();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn(() =>
      save.mock.calls.length === 1 ? firstSave.promise : Promise.resolve()
    );
    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      storageAdapter: { save },
    });

    controller.injectAssistantMessage({ content: "first" });
    controller.injectAssistantMessage({ content: "second" });
    firstSave.reject(new Error("storage unavailable"));
    await flushMicrotasks(8);

    expect(save).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      "[AgentWidget] Failed to persist state:",
      expect.any(Error)
    );
    errorSpy.mockRestore();
    controller.destroy();
  });

  it("keeps synchronous adapters synchronous", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const save = vi.fn();
    const controller = createAgentExperience(mount, {
      ...baseConfig(),
      storageAdapter: { save },
    });

    inject(controller);

    expect(save).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});

describe("default transcript key and local-only notices (runtypelabs/core#9961)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  const mount = () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
  };
  const storedContents = (key: string): string[] =>
    (JSON.parse(window.localStorage.getItem(key) ?? "{}").messages ?? []).map(
      (m: { content?: string }) => m.content
    );

  it("scopes each widget's transcript by persistState.keyPrefix", () => {
    const a = createAgentExperience(mount(), {
      ...baseConfig(),
      persistState: { keyPrefix: "ops-" },
    });
    const b = createAgentExperience(mount(), {
      ...baseConfig(),
      persistState: { keyPrefix: "ehr-" },
    });

    a.injectAssistantMessage({ content: "ops reply" });
    b.injectAssistantMessage({ content: "ehr reply" });

    expect(storedContents("ops-state")).toEqual(["ops reply"]);
    expect(storedContents("ehr-state")).toEqual(["ehr reply"]);
    expect(window.localStorage.getItem(DEFAULT_KEY)).toBeNull();
    a.destroy();
    b.destroy();
  });

  it("keeps reading the legacy key only for the default prefix", () => {
    window.localStorage.setItem(
      DEFAULT_KEY,
      JSON.stringify({
        messages: [
          { id: "legacy-1", role: "assistant", content: "legacy reply", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      })
    );

    const unprefixed = createAgentExperience(mount(), baseConfig());
    const prefixed = createAgentExperience(mount(), {
      ...baseConfig(),
      persistState: { keyPrefix: "ops-" },
    });

    expect(unprefixed.getMessages().map((m) => m.content)).toEqual(["legacy reply"]);
    expect(prefixed.getMessages().map((m) => m.content)).toEqual([]);
    unprefixed.destroy();
    prefixed.destroy();
  });

  it("never stores a local-only notice, including legacy reconnect-failure bubbles", () => {
    window.localStorage.setItem(
      DEFAULT_KEY,
      JSON.stringify({
        messages: [
          { id: "u1", role: "user", content: "hi", createdAt: "2026-01-01T00:00:00.000Z" },
          {
            id: "reconnect-failed-exec_1",
            role: "assistant",
            content: "Connection lost and the response could not be resumed.",
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      })
    );
    const controller = createAgentExperience(mount(), baseConfig());

    controller.injectAssistantMessage({ content: "kept" });

    expect(storedContents(DEFAULT_KEY)).toEqual(["hi", "kept"]);
    controller.destroy();
  });
});
