// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { HistoryProvider } from "./internal/history-provider";
import type { ClientSession, WidgetHistoryInternals } from "./types";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const sessions: AgentWidgetSession[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.destroy()); vi.restoreAllMocks(); });

function setup() {
  const demo = createDemoHistoryProvider({ conversations: ["a", "b", "origin"].map((id) => ({
    id, title: id, messages: [{ id: `${id}-message`, role: "assistant", content: `Transcript ${id}` }],
  })) });
  const metadata: Record<string, string> = {};
  const write = (key: string, value: string | null) => {
    if (value === null) delete metadata[key]; else metadata[key] = value;
  };
  const holds = new Map<string, { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }>();
  const commits: string[] = [];
  let installed: ClientSession | null = null;
  let session: AgentWidgetSession;
  const provider: HistoryProvider = {
    ...demo,
    resetDevice: async () => ({ remoteRevocationConfirmed: true }),
    async prepareOpen(id, opts) {
      const prepared = await demo.prepareOpen(id, opts);
      return {
        ...prepared,
        async commit() {
          commits.push(id);
          const hold = holds.get(id);
          if (hold) { hold.entered.resolve(); await hold.release.promise; }
          await prepared.commit();
          installed = {
            sessionId: `session-${id}`, conversationId: id,
            conversationRevision: prepared.conversationRevision,
            expiresAt: new Date("2099-01-01"),
            flow: { id: "flow", name: "Flow", description: null },
            config: { welcomeMessage: null, placeholder: "Message", theme: null },
          };
          // Exercises both a provider's session callback and Session's fallback.
          session.bindActivatedSession(installed);
        },
      };
    },
  };
  const internals: WidgetHistoryInternals = {
    historyProvider: provider,
    setStoredConversationRevision: (value) => write("revision", value),
    setStoredMessageCursor: (value) => write("cursor", value),
  };
  session = new AgentWidgetSession({
    apiUrl: "/chat",
    setStoredSessionId: (value) => write("sessionId", value),
    clearStoredSessionId: () => write("sessionId", null),
    setStoredConversationId: (value) => write("conversationId", value),
    clearStoredConversationId: () => write("conversationId", null),
  }, {
    onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
  }, internals);
  sessions.push(session);
  vi.spyOn(session.getClient(), "getClientSession").mockImplementation(() => installed);
  const hold = (id: string) => {
    const pending = { entered: deferred(), release: deferred() };
    holds.set(id, pending);
    return pending;
  };
  return { session, provider, metadata, internals, commits, hold };
}

describe("admitted conversation activation", () => {
  it("finishes an admitted commit coherently before a later selection snapshots it", async () => {
    const { session, metadata, commits, hold } = setup();
    await session.openConversation("origin");
    const first = hold("a");
    const admitted = vi.fn();
    const openingA = session.openConversation("a", { onCommitted: admitted });
    await first.entered.promise;
    const beforeB = vi.fn(() => {
      expect(session.getActiveConversationId()).toBe("a");
      expect(session.getMessages().map((message) => message.id)).toEqual(["a-message"]);
      expect(metadata).toMatchObject({ sessionId: "session-a", conversationId: "a" });
    });
    const openingB = session.openConversation("b", { onBeforeCommit: beforeB });
    expect(commits).toEqual(["origin", "a"]);
    first.release.resolve();
    await Promise.all([openingA, openingB]);
    expect(admitted).toHaveBeenCalledOnce();
    expect(beforeB).toHaveBeenCalledOnce();
    expect(session.getActiveConversationId()).toBe("b");
    expect(session.getMessages().map((message) => message.id)).toEqual(["b-message"]);
    expect(metadata).toMatchObject({ sessionId: "session-b", conversationId: "b" });
  });

  it("keeps the original transcript and stored binding when commit rejects before applying", async () => {
    const { session, metadata, hold } = setup();
    await session.openConversation("origin");
    const before = { ...metadata };
    const pending = hold("a");
    const onCommitted = vi.fn();
    const opening = session.openConversation("a", { onCommitted }).catch((error: unknown) => error);
    await pending.entered.promise;
    pending.release.reject(new Error("Commit refused"));
    expect(await opening).toMatchObject({ message: "Commit refused" });
    expect(session.getActiveConversationId()).toBe("origin");
    expect(session.getMessages().map((message) => message.id)).toEqual(["origin-message"]);
    expect(metadata).toEqual(before);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("does not restore messages or stored ids after a device reset during commit", async () => {
    const { session, metadata, hold } = setup();
    await session.openConversation("origin");
    const pending = hold("a");
    const onCommitted = vi.fn();
    const opening = session.openConversation("a", { onCommitted }).catch((error: unknown) => error);
    await pending.entered.promise;
    await session.resetHistoryDevice();
    pending.release.resolve();
    expect(await opening).toMatchObject({ code: "superseded" });
    expect(session.getActiveConversationId()).toBeNull();
    expect(session.getMessages()).toEqual([]);
    expect(metadata).toEqual({});
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("does not bind or hydrate a delayed activation after teardown", async () => {
    const { session, metadata, hold } = setup();
    await session.openConversation("origin");
    const before = { ...metadata };
    const pending = hold("a");
    const onCommitted = vi.fn();
    const opening = session.openConversation("a", { onCommitted }).catch((error: unknown) => error);
    await pending.entered.promise;
    session.destroy();
    pending.release.resolve();
    expect(await opening).toMatchObject({ code: "superseded" });
    expect(session.getActiveConversationId()).toBe("origin");
    expect(session.getMessages().map((message) => message.id)).toEqual(["origin-message"]);
    expect(metadata).toEqual(before);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("does not bind the retired provider after the history provider changes", async () => {
    const { session, metadata, internals, hold } = setup();
    await session.openConversation("origin");
    const before = { ...metadata };
    const pending = hold("a");
    const opening = session.openConversation("a").catch((error: unknown) => error);
    await pending.entered.promise;
    session.setHistoryInternals({ ...internals, historyProvider: createDemoHistoryProvider() });
    pending.release.resolve();
    expect(await opening).toMatchObject({ code: "superseded" });
    expect(session.getActiveConversationId()).toBe("origin");
    expect(session.getMessages().map((message) => message.id)).toEqual(["origin-message"]);
    expect(metadata).toEqual(before);
  });
});
