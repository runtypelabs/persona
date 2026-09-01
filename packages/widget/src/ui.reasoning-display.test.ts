// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const injectReasoning = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  status: "streaming" | "complete",
  chunks: string[] = ["Weighing the options"],
  durationMs?: number
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: status !== "complete",
      variant: "reasoning",
      reasoning: { id, status, chunks, durationMs },
    },
  });
};

const injectToolCall = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  status: "pending" | "running" | "complete"
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: status !== "complete",
      variant: "tool",
      toolCall: { id, name: "search", status, chunks: [] },
    },
  });
};

const injectText = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  content: string
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      streaming: false,
    },
  });
};

const rowOf = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLElement>(`#wrapper-${id}`);

describe("features.reasoningDisplay.iconName", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders no header icon by default", () => {
    const { mount, controller } = makeController();
    injectReasoning(controller, "r1", "streaming");
    expect(
      rowOf(mount, "r1")!.querySelector(".persona-reasoning-header-icon")
    ).toBeNull();
  });

  it("renders the named glyph at the leading edge of the header row", () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { iconName: "sparkles" } },
    });
    injectReasoning(controller, "r1", "streaming");
    const header = rowOf(mount, "r1")!.querySelector<HTMLElement>(
      "button[data-bubble-type='reasoning']"
    )!;
    const icon = header.querySelector(".persona-reasoning-header-icon");
    expect(icon).not.toBeNull();
    expect(icon!.querySelector("svg")).not.toBeNull();
    expect(header.firstElementChild).toBe(icon);
  });
});

describe("features.reasoningDisplay.completedVisibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it('keeps a finished reasoning row by default', () => {
    const { mount, controller } = makeController();
    injectReasoning(controller, "r1", "complete");
    expect(rowOf(mount, "r1")).not.toBeNull();
  });

  it('removes the whole row under "removed", leaving no transcript gap', () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed" } },
    });
    injectReasoning(controller, "r1", "complete");
    injectText(controller, "a1", "Here is the answer");

    expect(rowOf(mount, "r1")).toBeNull();
    // The answer is the only row left, so the removed trace occupies no space.
    const rows = mount.querySelectorAll("[data-wrapper-id]");
    expect(Array.from(rows).map((row) => row.getAttribute("data-wrapper-id")))
      .toEqual(["a1"]);
  });

  it('shows an active trace under "removed" and drops it once it completes', () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed" } },
    });
    injectReasoning(controller, "r1", "streaming");
    expect(rowOf(mount, "r1")).not.toBeNull();

    injectReasoning(controller, "r1", "complete");
    expect(rowOf(mount, "r1")).toBeNull();
  });

  it('keeps the reasoning message in the session under "removed"', () => {
    const { controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed" } },
    });
    injectReasoning(controller, "r1", "complete");
    expect(
      controller.getMessages().find((message) => message.id === "r1")?.reasoning
        ?.chunks
    ).toEqual(["Weighing the options"]);
  });

  it('"removed-when-short" drops a completed trace with a short reported duration', () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed-when-short" } },
    });
    injectReasoning(controller, "r1", "complete", ["Weighing the options"], 5_000);
    expect(rowOf(mount, "r1")).toBeNull();
  });

  it('"removed-when-short" keeps a completed trace with a long reported duration', () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed-when-short" } },
    });
    injectReasoning(controller, "r1", "complete", ["Weighing the options"], 20_000);
    expect(rowOf(mount, "r1")).not.toBeNull();
  });

  it('"removed-when-short" drops a completed trace with no duration and few chars', () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed-when-short" } },
    });
    injectReasoning(controller, "r1", "complete", ["Short thought"]);
    expect(rowOf(mount, "r1")).toBeNull();
  });

  it('"removed-when-short" keeps a completed trace with no duration and many chars', () => {
    const { mount, controller } = makeController({
      features: { reasoningDisplay: { completedVisibility: "removed-when-short" } },
    });
    injectReasoning(controller, "r1", "complete", ["x".repeat(1_500)]);
    expect(rowOf(mount, "r1")).not.toBeNull();
  });

  it('"removed-when-short" honors custom duration and char thresholds', () => {
    const { mount, controller } = makeController({
      features: {
        reasoningDisplay: {
          completedVisibility: "removed-when-short",
          shortThinkThreshold: { durationMs: 1_000, chars: 50 },
        },
      },
    });
    // 5s exceeds the custom 1s threshold, so this long-by-default trace is kept.
    injectReasoning(controller, "r1", "complete", ["Weighing the options"], 5_000);
    expect(rowOf(mount, "r1")).not.toBeNull();

    // 60 chars exceeds the custom 50-char threshold, so this trace is kept too.
    injectReasoning(controller, "r2", "complete", ["y".repeat(60)]);
    expect(rowOf(mount, "r2")).not.toBeNull();

    // Under both custom thresholds, so this trace is dropped.
    injectReasoning(controller, "r3", "complete", ["z".repeat(10)], 500);
    expect(rowOf(mount, "r3")).toBeNull();
  });
});

describe("features.toolCallDisplay.completedVisibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps a finished tool call row by default", () => {
    const { mount, controller } = makeController();
    injectToolCall(controller, "t1", "complete");
    expect(rowOf(mount, "t1")).not.toBeNull();
  });

  it('removes the whole row under "removed", leaving no transcript gap', () => {
    const { mount, controller } = makeController({
      features: { toolCallDisplay: { completedVisibility: "removed" } },
    });
    injectToolCall(controller, "t1", "complete");
    injectText(controller, "a1", "Here is the answer");

    expect(rowOf(mount, "t1")).toBeNull();
    const rows = mount.querySelectorAll("[data-wrapper-id]");
    expect(Array.from(rows).map((row) => row.getAttribute("data-wrapper-id")))
      .toEqual(["a1"]);
  });

  it('shows a running tool call under "removed" and drops it once it completes', () => {
    const { mount, controller } = makeController({
      features: { toolCallDisplay: { completedVisibility: "removed" } },
    });
    injectToolCall(controller, "t1", "running");
    expect(rowOf(mount, "t1")).not.toBeNull();

    injectToolCall(controller, "t1", "complete");
    expect(rowOf(mount, "t1")).toBeNull();
  });

  it('keeps the tool call message in the session under "removed"', () => {
    const { controller } = makeController({
      features: { toolCallDisplay: { completedVisibility: "removed" } },
    });
    injectToolCall(controller, "t1", "complete");
    expect(
      controller.getMessages().find((message) => message.id === "t1")?.toolCall
        ?.status
    ).toEqual("complete");
  });
});
