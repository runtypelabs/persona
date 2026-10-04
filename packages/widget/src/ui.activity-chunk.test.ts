// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// Simulate the lazy path: the activity-ui chunk is not provided up front and
// each test controls when (and whether) its load resolves.
const chunk = vi.hoisted(() => {
  let settle: { resolve: (mod: unknown) => void; reject: (err: unknown) => void } | null = null;
  let promise: Promise<unknown> = Promise.resolve();
  let loaded: unknown = null;
  const reset = () => {
    loaded = null;
    promise = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
  };
  return {
    reset,
    load: () => promise,
    getSync: () => loaded,
    resolve: (mod: unknown) => {
      loaded = mod;
      settle?.resolve(mod);
    },
    reject: () => settle?.reject(new Error("network")),
  };
});

vi.mock("./activity-ui-loader", () => ({
  getActivityUiSync: () => chunk.getSync(),
  loadActivityUi: () => chunk.load(),
  setActivityUiLoader: () => {},
  provideActivityUi: () => {},
}));

import { createAgentExperience } from "./ui";
import * as activityUi from "./activity-ui";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const mount = () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const controller = createAgentExperience(el, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
  });
  return { el, controller };
};

const injectTool = (controller: ReturnType<typeof createAgentExperience>, id: string) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: "2026-10-03T00:00:00.000Z",
      streaming: false,
      variant: "tool",
      toolCall: { id: `call-${id}`, name: "search_docs", status: "complete", args: { q: "x" }, result: "ok" },
    },
  });
};

describe("activity-ui chunk transport", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("holds an empty row while the chunk loads, then renders the tool bubble", async () => {
    chunk.reset();
    const { el, controller } = mount();
    injectTool(controller, "tool-1");

    expect(el.querySelector("#wrapper-tool-1")).not.toBeNull();
    expect(el.querySelector(".persona-tool-bubble")).toBeNull();

    chunk.resolve(activityUi);
    await flush();

    expect(el.querySelector("#wrapper-tool-1 .persona-tool-bubble")).not.toBeNull();
    controller.destroy();
  });

  it("keeps the transcript alive when the load fails", async () => {
    chunk.reset();
    const { el, controller } = mount();
    injectTool(controller, "tool-2");
    chunk.reject();
    await flush();

    expect(el.querySelector("#wrapper-tool-2")).not.toBeNull();
    expect(el.querySelector(".persona-tool-bubble")).toBeNull();
    controller.destroy();
  });

  it("does not re-render into a destroyed widget when the chunk lands late", async () => {
    chunk.reset();
    const { el, controller } = mount();
    injectTool(controller, "tool-3");
    controller.destroy();
    chunk.resolve(activityUi);
    await flush();

    expect(el.querySelector(".persona-tool-bubble")).toBeNull();
  });

  it("waits for the chunk before handing a plugin its defaultRenderer", async () => {
    chunk.reset();
    const renderToolCall = vi.fn(({ defaultRenderer }: { defaultRenderer: () => HTMLElement }) => {
      const bubble = defaultRenderer();
      bubble.dataset.decorated = "true";
      return bubble;
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    const controller = createAgentExperience(el, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [{ id: "decorate-tools", renderToolCall }],
    });
    injectTool(controller, "tool-4");
    expect(renderToolCall).not.toHaveBeenCalled();

    chunk.resolve(activityUi);
    await flush();

    expect(renderToolCall).toHaveBeenCalled();
    expect(el.querySelector('#wrapper-tool-4 .persona-tool-bubble[data-decorated="true"]')).not.toBeNull();
    controller.destroy();
  });
});
