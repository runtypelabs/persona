import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, AgentWidgetMessage } from "./types";

const create = () => {
  const started = vi.fn();
  const finished = vi.fn();
  const session = new AgentWidgetSession({ apiUrl: "/chat" }, {
    onMessagesChanged: vi.fn(), onStatusChanged: vi.fn(), onStreamingChanged: vi.fn(),
    onRunStarted: started, onRunFinished: finished,
  });
  return { session, started, finished };
};

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("session-owned run lifecycle", () => {
  it("keeps an approval pause open and finishes once after the resumed stream", async () => {
    vi.useFakeTimers();
    vi.spyOn(AgentWidgetClient.prototype, "dispatch").mockImplementation(async (_options, emit) => {
      emit({ type: "message", message: { id: "approval", role: "assistant", content: "", createdAt: "now", variant: "approval", approval: { id: "a", status: "pending" } } } as AgentWidgetEvent);
      emit({ type: "status", status: "idle" });
    });
    const { session, started, finished } = create();
    await session.sendMessage("hello");
    await vi.runAllTimersAsync();
    expect(started).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();
    vi.spyOn(AgentWidgetClient.prototype, "processStream").mockImplementation(async (_stream, emit) => {
      emit({ type: "message", message: { id: "approval", role: "assistant", content: "approved", createdAt: "now", variant: "approval", approval: { id: "a", status: "approved" } } } as AgentWidgetEvent);
      emit({ type: "status", status: "idle", terminal: true });
    });
    await session.connectStream(new ReadableStream({ start(controller) { controller.close(); } }), { allowReentry: true });
    await vi.runAllTimersAsync();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0][0]).toMatchObject({ runId: started.mock.calls[0][0].runId, outcome: "success" });
    session.destroy();
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("reports failures as errors even when dispatch ends idle", async () => {
    vi.useFakeTimers();
    vi.spyOn(AgentWidgetClient.prototype, "dispatch").mockImplementation(async (_options, emit) => {
      emit({ type: "status", status: "idle" });
      throw new Error("offline");
    });
    const { session, finished } = create();
    await session.sendMessage("hello");
    await vi.runAllTimersAsync();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0][0].outcome).toBe("error");
    session.destroy();
  });

  it("retains a terminal failure even when the transport emits a trailing idle", async () => {
    vi.useFakeTimers();
    vi.spyOn(AgentWidgetClient.prototype, "dispatch").mockImplementation(async (_options, emit) => {
      emit({ type: "status", status: "error", terminal: true });
      emit({ type: "status", status: "idle" });
    });
    const { session, finished } = create();
    await session.sendMessage("hello");
    await vi.runAllTimersAsync();
    expect(finished.mock.calls[0][0].outcome).toBe("error");
    session.destroy();
  });

  it("reports execution_complete success:false as a failed run", async () => {
    const { session, finished } = create();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"execution_complete","success":false}\n\n'));
      controller.close();
    } });
    await session.connectStream(stream);
    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
    expect(finished.mock.calls[0][0].outcome).toBe("error");
    session.destroy();
  });

  it("rejects late events and rejections from a superseded run", async () => {
    const emits: ((event: AgentWidgetEvent) => void)[] = [];
    const rejects: ((reason: Error) => void)[] = [];
    vi.spyOn(AgentWidgetClient.prototype, "dispatch").mockImplementation((_options, emit) => {
      emits.push(emit);
      return new Promise((_resolve, reject) => rejects.push(reject));
    });
    const { session, started, finished } = create();
    const first = session.sendMessage("first");
    void session.sendMessage("second");
    expect(started).toHaveBeenCalledTimes(2);
    expect(started.mock.calls[0][0].runId).not.toBe(started.mock.calls[1][0].runId);
    emits[0]({ type: "message", message: { id: "stale", role: "assistant", content: "stale", createdAt: "now" } });
    rejects[0](new Error("old transport rejected"));
    await first;
    expect(session.getMessages().some((message) => message.id === "stale")).toBe(false);
    expect(finished).toHaveBeenCalledTimes(1);
    session.destroy();
    expect(finished).toHaveBeenCalledTimes(2);
    expect(finished.mock.calls.map(([event]) => event.outcome)).toEqual(["cancel", "cancel"]);
  });

  it("cancels once on clear and destruction while dispatch is pending", async () => {
    vi.spyOn(AgentWidgetClient.prototype, "dispatch").mockImplementation(() => new Promise(() => {}));
    const { session, started, finished } = create();
    void session.sendMessage("hello");
    expect(started).toHaveBeenCalledTimes(1);
    session.clearMessages();
    session.destroy();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0][0].outcome).toBe("cancel");
  });
});

const toolMessage = (id: string, executionId?: string): AgentWidgetMessage => ({ id, role: 'assistant', content: '', createdAt: 'now', variant: 'tool', agentMetadata: executionId ? { executionId } : undefined, toolCall: { id, name: 'Search', status: 'complete' } });
describe('current-run message ownership', () => {
  it.each(['send', 'continue'] as const)('resets before %s renders and records new tools before observer notification', async next => {
    vi.useFakeTimers();
    const { session } = create();
    const snapshots: string[][] = [];
    const dispatch = vi.spyOn(AgentWidgetClient.prototype, 'dispatch').mockImplementation(async (_options, emit) => {
      emit({ type: 'message', message: toolMessage('first') });
      emit({ type: 'status', status: 'idle', terminal: true });
    });
    await session.sendMessage('first run'); await vi.runAllTimersAsync();
    expect([...(session.getRunActivity()?.messageIds ?? new Set<string>())]).toEqual(['first']);
    dispatch.mockImplementation(async (_options, emit) => {
      snapshots.push([...(session.getRunActivity()?.messageIds ?? new Set<string>())]);
      emit({ type: 'message', message: toolMessage('second') });
      snapshots.push([...(session.getRunActivity()?.messageIds ?? new Set<string>())]);
      emit({ type: 'status', status: 'idle', terminal: true });
    });
    if (next === 'send') await session.sendMessage('second run'); else await session.continueConversation();
    expect(snapshots).toEqual([[], ['second']]);
    expect(session.getMessages().filter(message => message.role === 'user')).toHaveLength(next === 'send' ? 2 : 1);
    session.hydrateMessages([toolMessage('first')]); expect((session.getRunActivity()?.messageIds ?? new Set<string>()).size).toBe(0);
    session.destroy();
  });
  it('retains ownership through approval pauses and stream reentry, then clears it with the transcript', async () => {
    vi.useFakeTimers(); const { session } = create();
    vi.spyOn(AgentWidgetClient.prototype, 'dispatch').mockImplementation(async (_options, emit) => {
      emit({ type: 'message', message: toolMessage('before-pause') });
      emit({ type: 'message', message: { id: 'approval', role: 'assistant', content: '', createdAt: 'now', variant: 'approval', approval: { id: 'a', status: 'pending' } } } as AgentWidgetEvent);
      emit({ type: 'status', status: 'idle' });
    });
    await session.sendMessage('hello'); await vi.runAllTimersAsync();
    expect([...(session.getRunActivity()?.messageIds ?? new Set<string>())]).toEqual(['before-pause', 'approval']);
    vi.spyOn(AgentWidgetClient.prototype, 'processStream').mockImplementation(async (_stream, emit) => {
      expect([...(session.getRunActivity()?.messageIds ?? new Set<string>())]).toEqual(['before-pause', 'approval']);
      emit({ type: 'message', message: toolMessage('after-pause') });
      emit({ type: 'status', status: 'idle', terminal: true });
    });
    await session.connectStream(new ReadableStream({ start(controller) { controller.close(); } }), { allowReentry: true });
    expect([...(session.getRunActivity()?.messageIds ?? new Set<string>())]).toEqual(['before-pause', 'approval', 'after-pause']);
    session.clearMessages(); expect((session.getRunActivity()?.messageIds ?? new Set<string>()).size).toBe(0); session.destroy();
  });
  it('seeds a durable parked execution using matching assistant metadata only', () => {
    const session = new AgentWidgetSession({ apiUrl: '/chat', reconnectStream: async () => new Response(), initialMessages: [
      toolMessage('matching', 'e1'), toolMessage('other', 'e2'), toolMessage('unknown'),
      { id: 'approval', role: 'assistant', content: '', createdAt: 'now', variant: 'approval', approval: { id: 'a', status: 'pending', executionId: 'e1' } } as AgentWidgetMessage,
    ] }, { onMessagesChanged: vi.fn(), onStatusChanged: vi.fn(), onStreamingChanged: vi.fn() });
    expect((session.getRunActivity()?.messageIds ?? new Set<string>()).size).toBe(0);
    session.resumeFromHandle({ executionId: 'e1', after: '5' });
    expect([...(session.getRunActivity()?.messageIds ?? new Set<string>())]).toEqual(['matching']); session.destroy();
  });
});

it('makes current tool ownership available inside the messages-changed callback', async () => {
  let session: AgentWidgetSession;
  const observed: boolean[] = [];
  session = new AgentWidgetSession({ apiUrl: '/chat' }, {
    onMessagesChanged: messages => {
      for (const message of messages) if (message.variant === 'tool') observed.push((session.getRunActivity()?.messageIds ?? new Set<string>()).has(message.id));
    }, onStatusChanged: vi.fn(), onStreamingChanged: vi.fn(),
  });
  vi.spyOn(AgentWidgetClient.prototype, 'dispatch').mockImplementation(async (_options, emit) => {
    emit({ type: 'message', message: toolMessage('current') });
    emit({ type: 'status', status: 'idle', terminal: true });
  });
  await session.continueConversation();
  expect(observed).toEqual([true]); session.destroy(); expect((session.getRunActivity()?.messageIds ?? new Set<string>()).size).toBe(0);
});

it('does not claim historical tools encountered in read-only replay', async () => {
  vi.spyOn(AgentWidgetClient.prototype, 'processStream').mockImplementation(async (_stream, emit) => {
    emit({ type: 'message', message: toolMessage('historical') });
    emit({ type: 'status', status: 'idle', terminal: true });
  });
  const { session } = create();
  await session.connectStream(new ReadableStream({ start(controller) { controller.close(); } }), { readOnlyReplay: true });
  expect(session.getMessages().some(message => message.id === 'historical')).toBe(true);
  expect((session.getRunActivity()?.messageIds ?? new Set<string>()).size).toBe(0); session.destroy();
});
