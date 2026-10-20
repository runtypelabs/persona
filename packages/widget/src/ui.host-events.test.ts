// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, AgentWidgetMessage, AgentWidgetStoredState } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const mount = (v5Defaults = false) => {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = createAgentExperience(root, {
    apiUrl: "/chat", launcher: { enabled: false }, persistState: false,
    future: { v5Defaults }, features: { streamAnimation: { type: "none" } },
  });
  controllers.push(controller);
  return controller;
};

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each([false, true])("host events (v5Defaults=%s)", (v5Defaults) => {
  it("isolates message events and includes public identity on clear notifications", () => {
    const first = mount(v5Defaults);
    const second = mount(v5Defaults);
    expect(first.instanceId).not.toBe(second.instanceId);
    const changed = vi.fn();
    const otherChanged = vi.fn();
    first.on("messages:changed", changed);
    second.on("messages:changed", otherChanged);
    const message = first.injectAssistantMessage({ content: "hello" });
    expect(changed).toHaveBeenLastCalledWith([message], { instanceId: first.instanceId });
    expect(otherChanged).not.toHaveBeenCalled();
    const cleared = vi.fn();
    window.addEventListener("persona:clear-chat", cleared);
    first.clearChat();
    window.removeEventListener("persona:clear-chat", cleared);
    expect(changed).toHaveBeenLastCalledWith([], { instanceId: first.instanceId });
    expect(cleared.mock.calls[0][0].detail.instanceId).toBe(first.instanceId);
    expect(otherChanged).not.toHaveBeenCalled();
    first.destroy();
    changed.mockClear();
    first.injectAssistantMessage({ content: "late" });
    expect(changed).not.toHaveBeenCalled();
  });

  it("notifies hosts when asynchronous stored history is restored", async () => {
    let restore!: (state: AgentWidgetStoredState) => void;
    const pending = new Promise<AgentWidgetStoredState>((resolve) => { restore = resolve; });
    const root = document.createElement("div");
    document.body.append(root);
    const controller = createAgentExperience(root, {
      apiUrl: "/chat", launcher: { enabled: false }, future: { v5Defaults },
      storageAdapter: { load: () => pending, save: () => {} },
    });
    controllers.push(controller);
    const changed = vi.fn();
    controller.on("messages:changed", changed);
    restore({ messages: [{ id: "restored", role: "assistant", content: "history", createdAt: "now" }] });
    await pending;
    await Promise.resolve();
    expect(changed.mock.calls.at(-1)![0][0]).toMatchObject({ id: "restored", content: "history" });
    expect(changed.mock.calls.at(-1)![1]).toEqual({ instanceId: controller.instanceId });
  });

  it("coalesces streamed text while preserving structural message changes", async () => {
    const frames = new Map<number, ((time: number) => void)>();
    let nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: ((time: number) => void)) => { frames.set(++nextFrame, callback); return nextFrame; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    let emit: ((event: AgentWidgetEvent) => void) | undefined;
    vi.spyOn(AgentWidgetClient.prototype, "dispatch").mockImplementation(async (_options, onEvent) => { emit = onEvent; });
    const controller = mount(v5Defaults);
    const changed = vi.fn();
    controller.on("messages:changed", changed);
    controller.submitMessage("hello");
    await Promise.resolve();
    const message: AgentWidgetMessage = { id: "stream", role: "assistant", content: "a", createdAt: "now", sequence: 1, streaming: true };
    emit!({ type: "message", message });
    const count = changed.mock.calls.length;
    emit!({ type: "message", message: { ...message, content: "ab" } });
    emit!({ type: "message", message: { ...message, content: "abc" } });
    expect(changed).toHaveBeenCalledTimes(count);
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
    expect(changed).toHaveBeenCalledTimes(count + 1);
    expect(changed.mock.calls.at(-1)![0].find((entry: AgentWidgetMessage) => entry.id === "stream").content).toBe("abc");
    controller.injectUserMessage({ content: "structural" });
    expect(changed).toHaveBeenCalledTimes(count + 2);
    vi.unstubAllGlobals();
  });
});
