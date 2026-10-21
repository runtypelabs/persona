import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoDurableChat } from "./demo-durable-chat";

afterEach(() => vi.useRealTimers());

describe("local durable chat transport", () => {
  it("freezes cached document jobs without losing the replay checkpoint", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const chat = createDemoDurableChat({ getConversationId: () => "a", onComplete, delayMs: 10 });
    const abort = new AbortController();
    const response = await chat.customFetch("/local", { signal: abort.signal }, { messages: [] });
    const content = response.text();
    await vi.advanceTimersByTimeAsync(20);
    abort.abort();
    const first = await content;
    chat.pause();
    await vi.advanceTimersByTimeAsync(10000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    chat.resume();
    chat.resume();
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    expect(onComplete).toHaveBeenCalledOnce();
    const cursors = [...first.matchAll(/^id: (\d+)$/gm)];
    const cursor = cursors[cursors.length - 1][1];
    const replay = await chat.reconnectStream({ conversationId: "a", executionId: "local-durable-1", after: cursor, signal: new AbortController().signal });
    expect(await replay.text()).toContain('"type":"execution_complete"');
    chat.destroy();
    chat.resume();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps working after disconnect and replays only frames after the saved cursor", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const chat = createDemoDurableChat({ getConversationId: () => "a", onComplete, delayMs: 10 });
    const abort = new AbortController();
    const initial = await chat.customFetch("/local", { signal: abort.signal }, { messages: [] });
    const initialText = initial.text();
    await vi.advanceTimersByTimeAsync(30);
    abort.abort();
    const first = await initialText;
    const cursors = [...first.matchAll(/^id: (\d+)$/gm)];
    const cursor = cursors[cursors.length - 1][1];
    const states: string[] = [];
    const unsubscribe = chat.subscribeStatus({ conversationId: "a", executionId: "local-durable-1" }, state => states.push(state));
    await vi.runAllTimersAsync();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["running", "completed"]);
    const replay = await chat.reconnectStream({ conversationId: "a", executionId: "local-durable-1", after: cursor, signal: new AbortController().signal });
    const rest = await replay.text();
    expect([...rest.matchAll(/^id: (\d+)$/gm)].every(match => Number(match[1]) > Number(cursor))).toBe(true);
    const deltas = [...(first + rest).matchAll(/^data: (.+)$/gm)].map(match => JSON.parse(match[1])).filter(frame => frame.type === "text_delta").map(frame => frame.delta).join("");
    expect(deltas).toBe(onComplete.mock.calls[0][0].text);
    expect(rest).toContain('"type":"execution_complete"');
    unsubscribe();
    chat.destroy();
  });

  it("rejects wrong conversation identity and releases timers/readers on disposal", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const chat = createDemoDurableChat({ getConversationId: () => "a", onComplete });
    const response = await chat.customFetch("/local", {}, { messages: [] });
    const content = response.text();
    await expect(chat.reconnectStream({ conversationId: "b", executionId: "local-durable-1", after: "0", signal: new AbortController().signal })).rejects.toThrow("not found");
    chat.destroy();
    await content;
    await vi.runAllTimersAsync();
    expect(onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
