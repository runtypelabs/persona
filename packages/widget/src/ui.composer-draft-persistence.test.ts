// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetStoredState } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const streamResponse = () => {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"flow_complete","success":true}\n\n')
        );
        controller.close();
      },
    }),
  } as unknown as Response;
};

/** In-memory adapter standing in for a host-owned, conversation-scoped one. */
const makeAdapter = () => {
  const saves: AgentWidgetStoredState[] = [];
  let stored: AgentWidgetStoredState | null = null;
  return {
    saves,
    latest: () => saves.at(-1),
    seed: (state: AgentWidgetStoredState) => {
      stored = state;
    },
    adapter: {
      load: () => stored,
      save: (state: AgentWidgetStoredState) => {
        stored = state;
        saves.push(state);
      },
      clear: () => {
        stored = null;
      },
    },
  };
};

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 10) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const type = async (mount: HTMLElement, value: string) => {
  const textarea = textareaOf(mount);
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
};

describe("composer draft persistence", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    global.fetch = vi.fn(async () => streamResponse()) as unknown as typeof fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("debounces the write and stores the draft in the conversation payload", async () => {
    const store = makeAdapter();
    const { mount } = makeController({ storageAdapter: store.adapter });
    await type(mount, "half a thought");
    expect(store.saves.some((state) => state.draft)).toBe(false);

    vi.advanceTimersByTime(600);
    await flush();
    expect(store.latest()?.draft?.text).toBe("half a thought");
  });

  it("flushes a queued write on destroy", async () => {
    const store = makeAdapter();
    const { mount, controller } = makeController({ storageAdapter: store.adapter });
    await type(mount, "unsaved");
    expect(store.saves.some((state) => state.draft)).toBe(false);

    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);
    expect(store.latest()?.draft?.text).toBe("unsaved");
  });

  it("restores text, model, modes, and quote across a re-init", async () => {
    const store = makeAdapter();
    store.seed({
      messages: [],
      draft: {
        text: "restored draft",
        selectedModelId: "fast",
        activeModeIds: ["search"],
        quote: { text: "quoted" },
      },
    });
    const { mount, controller } = makeController({
      storageAdapter: store.adapter,
      composer: {
        models: [{ id: "fast", label: "Fast" }],
        modes: [{ id: "search", label: "Search" }],
      },
    });
    await flush();
    expect(textareaOf(mount).value).toBe("restored draft");
    const state = controller.getComposerState();
    expect(state.selectedModelId).toBe("fast");
    expect(state.activeModeIds).toEqual(["search"]);
    expect(state.quote).toEqual({ text: "quoted" });
  });

  it("drops a model id and mode ids that are no longer configured", async () => {
    const store = makeAdapter();
    store.seed({
      messages: [],
      draft: {
        text: "restored draft",
        selectedModelId: "gone",
        activeModeIds: ["gone"],
      },
    });
    const { controller } = makeController({ storageAdapter: store.adapter });
    await flush();
    expect(controller.getComposerState().selectedModelId).toBeUndefined();
    expect(controller.getComposerState().activeModeIds).toEqual([]);
  });

  it("degrades mention tokens to plain text when the source is gone", async () => {
    const store = makeAdapter();
    store.seed({
      messages: [],
      draft: {
        text: "hi @a",
        mentionRefs: [{ sourceId: "removed", itemId: "a", label: "a" }],
        contentSegments: [{ kind: "text", text: "hi " }],
      },
    });
    const { mount, controller } = makeController({ storageAdapter: store.adapter });
    await flush();
    expect(textareaOf(mount).value).toBe("hi @a");
    expect(controller.getComposerState().mentionRefs).toEqual([]);
  });

  it("clears the stored draft after a send is accepted locally", async () => {
    const store = makeAdapter();
    const { mount } = makeController({ storageAdapter: store.adapter });
    await type(mount, "about to send");
    vi.advanceTimersByTime(600);
    await flush();
    expect(store.latest()?.draft?.text).toBe("about to send");

    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    vi.advanceTimersByTime(600);
    await flush();
    expect(store.latest()?.draft).toBeUndefined();
  });

  it("clears the stored draft on clear chat", async () => {
    const store = makeAdapter();
    const { mount, controller } = makeController({ storageAdapter: store.adapter });
    await type(mount, "about to be cleared");
    vi.advanceTimersByTime(600);
    await flush();
    expect(store.latest()?.draft?.text).toBe("about to be cleared");

    controller.clearChat();
    await flush();
    expect(store.latest()?.draft).toBeUndefined();
  });

  it("persistState: false disables it entirely", async () => {
    const store = makeAdapter();
    const { mount } = makeController({
      storageAdapter: store.adapter,
      persistState: false,
    });
    await type(mount, "never stored");
    vi.advanceTimersByTime(600);
    await flush();
    expect(store.saves.some((state) => state.draft)).toBe(false);
  });

  it("persist.draft: false disables just the draft", async () => {
    const store = makeAdapter();
    const { mount } = makeController({
      storageAdapter: store.adapter,
      persistState: { persist: { draft: false } },
    });
    await type(mount, "never stored");
    vi.advanceTimersByTime(600);
    await flush();
    expect(store.saves.some((state) => state.draft)).toBe(false);
  });

  it("persists by default under a granular persistState object", async () => {
    const store = makeAdapter();
    const { mount } = makeController({
      storageAdapter: store.adapter,
      persistState: { persist: { openState: true } },
    });
    await type(mount, "stored by default");
    vi.advanceTimersByTime(600);
    await flush();
    expect(store.latest()?.draft?.text).toBe("stored by default");
  });

  it("never stores File objects or attachment handles", async () => {
    const store = makeAdapter();
    const { mount } = makeController({ storageAdapter: store.adapter });
    await type(mount, "text only");
    vi.advanceTimersByTime(600);
    await flush();
    expect(Object.keys(store.latest()?.draft ?? {})).toEqual(["text"]);
  });
});
